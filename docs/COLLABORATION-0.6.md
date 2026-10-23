# Version 0.6 development: collaborative control

The 0.5 foundation is preserved on `main`, including launcher fixes in `ed033c1`.
Development starts on `codex/0.6-collaboration`. No 0.6 binary has been released
or deployed to the running internet show.

## First milestone: host policy prototype

`godot/scripts/control_authority.gd` is a host-thread policy component. The
`control_native_adapter.gd` adapter now connects it to the embedded bridge in
isolated integration tests and the opt-in Show host controls. Control messages use
the existing relay sockets; there is no new network endpoint. The end-user remote
Godot client remains a subsequent milestone.

The intended command contains an epoch, increasing sequence number, action,
decimal-string module ID and integer parameter ID. `begin` returns an ownership
token. `update` requires that token and a finite normalized value in [0,1]; `end`
releases ownership. Replies identify the request, epoch and applied revision,
and return the engine adapter's canonical value after snapping/clamping.

Policy decisions in this prototype:

- Only identities granted by host code can act. A client-provided role is never
  authority. The relay must supply the authenticated connection identity.
- First host-processed grab wins. A local host grab revokes remote ownership and
  blocks further grabs until local release. No global ordering across machines
  or CRDT is needed.
- One gesture per remote connection; different parameters allow simultaneous
  performers. This initial limit must be revisited before two-handed interaction.
- Leases expire after 1.5 seconds without a valid update. A stationary held
  control must periodically send its current value; the client stops sending
  after losing the lease. Disconnect/revocation releases ownership immediately.
- A token bucket allows 60 requests/second with a 20-request burst; state is
  bounded to 16 granted performers. These are prototype limits, not measured
  production capacity.
- Patch replacement uses a new unique epoch and clears grants and leases.
  Reconnect starts with a fresh connection identity, baseline and host grant.
  Old gestures must never be replayed.
- The adapter checks the native target on every request and returns the value
  actually applied. Only an accepted update advances the applied revision.

Run with the pinned Godot:

```text
python scripts/check_frontend.py <Godot.exe> tests/control_authority.gd
```

Coverage includes three simultaneous performers on different controls, contention,
host priority, disconnect/regrant, expiry, patch epochs, replay, malformed values,
missing targets, adapter failure, request correlation and resource bounds.

## Next integration milestones

1. **Native parameter adapter and local gestures (adapter implemented).** The
   embedded-only `parameter_edit` operation in `bridge/Cardinal3DBridge.hpp`
   supports bounded knob/slider/switch begin/update/end gestures, native scaled values
   and one history entry per gesture. Native local pointer-down and release
   finalize active remote edits; patch replacement invalidates the generation.
   Authority expiry/revocation/local takeover invokes adapter cleanup. Embedded
   local pointer-down signals finish remote gestures; remote actions are rejected
   while a local pointer gesture is held. This first integration conservatively
   pauses all remote controls during a local grab rather than identifying its target.
   Native pointer/menu/file operations remain excluded from remote control.
2. **Authenticated control route (implemented, opt-in).** `control-relay.mjs`
   binds actions to socket identities. The native publisher alone establishes
   epochs and grants/revokes individual visitors. `show_controls.gd` adds the host
   toggle and visitor selector to Show & broadcast. The default remains disabled.
   Each grant has a fresh token; reconnects and host/patch changes lose grants.
   The worker queues events and Godot executes them on its main thread.
3. **One remote knob end to end (browser implementation).** The existing visitor
   now supports granted knob/slider/button/switch gestures and atomic cable edits through desktop dragging, an accessible
   parameter selector/range input, and WebXR trigger-and-controller-height input.
   It continues to receive streamed audio without creating an engine. Visual
   snapshots carry a control epoch and revision for this limited parameter baseline;
   they remain insufficient for structural patch editing. Provisional movement is
   reconciled with canonical acknowledgments. A native Godot remote client, two-machine
   testing, imposed latency testing and physical headset acceptance remain pending.
4. **Modules/transforms, then broader hardware abstraction.** Cable operations now
   reuse the native undoable patch operations with wiring-version checks. Introduce
   separate validated semantic operations for module insertion/removal and transforms.
   Reuse action semantics across desktop/OpenXR adapters. Structural edits need
   deadline measurements and reconnect tests before live use.

Existing visitor transport and one authoritative Cardinal engine remain central.
No second DSP engine, parallel multiplayer server or public deployment is part
of this first milestone. Physical VR acceptance and clean-machine build validation
from the foundation report remain outstanding.

## Native adapter validation, 2026-10-12

The full native Windows library compiled successfully in WSL. Its candidate DLL
was copied only to `.tools/collaboration-native`, preserving `dist/embedded-full`
and the working launcher. Raw logs are in ignored `reports/`.

- `tests/parameter_edit.py`: real-engine gesture updates, a single undo/redo,
  conflicting and simultaneous targets, malformed values, local pointer takeover,
  deletion, patch-generation rejection and native SEQ3 Steps snapping all passed.
- `tests/control_native.gd`: policy → Godot adapter → real engine, canonical
  acknowledgment and cleanup on disconnect/local takeover passed in a disposable
  graphics project with isolated settings.
- `tests/control_authority.gd`: policy regressions passed with lifecycle hooks.
- Existing `tests/embedded_host.py`: passed with 1,419 models, patch roundtrip,
  native undo, MIDI, MixMaster faders and 4,652 concurrent UI/audio blocks without
  silent blocks. This is not an audio deadline or physical VR certification.

As of the 2026-10-20 response fix, parameter actions use compact native replies;
the regular frame poll owns the scene step/snapshot. See [measurements and rendering
fixes](0.6-RESPONSIVENESS.md). Cable actions still obtain a full updated snapshot. The relay now caps the combined rate at 30 commands/second (burst four),
and the host executes at most one action per frame. A client-only Godot performer
remains unimplemented. Custom knob subclasses may
have widget-specific behavior beyond ParamQuantity; broaden compatibility only
with module-specific acceptance tests.

## Control routing and recovery

The host enables experimental collaboration, selects a visitor and grants control.
Names are display-only; the selector includes a connection-ID prefix and permission
is tied to the full server-issued ID. Neither public room access nor an invitation
automatically grants editing. A browser visitor remains a visitor in room state;
control permission is a separate private message.

Parameter updates negotiate a bounded window of up to three outstanding commands
per performer. Begin/end and cable edits remain acknowledgment barriers. Commands are limited to
4 KiB and normalized begin/update/end parameter operations or bounded cable operations. Arbitrary native
commands, actor IDs and paths in client messages are stripped or rejected.
The host validates current native targets again before applying values.

An unanswered command revokes the grant after 1.5 seconds. Backpressure also
revokes access; overflowing the host's bounded 32-event queue closes its socket,
requiring explicit reconnection. Host output is bounded to 64 commands. Disconnect
events and the room membership snapshot both clear host-side grants/gestures.
Regrant always has a fresh token. A client must not replay old actions.

The integration probe can be run without using the public show:

```text
python scripts/check_show.py --godot <Godot.exe> --controls --engine <candidate-engine.dll>
```

It starts a loopback relay, a temporary Godot/native host, and a headless visitor
using the same `ControlClient` as the browser interface. It receives a grant and
edits the fixture VCO frequency, including release before the begin acknowledgment.
This validates gesture routing, not physical input or audio latency. The public Umbrel
deployment and working 0.5 launcher remain unchanged.

Validation of this routing milestone: all 47 browser/relay tests passed, including
real sockets. The full loopback visitor → relay → Godot worker → main-thread
policy → native parameter probe passed. Permission-button tests cover local
takeover and a delayed grant reply arriving after local revocation. The existing
live publisher/audio test also passed through a 700 ms UI stall (two sources,
135 packets, maximum observed packet gap 98.99 ms). These checks do not certify
internet latency, large-patch frame times or physical headset operation.

## Browser performer interface, 2026-10-18

For a 0.6 development host and matching 0.6 relay, start publishing a Show, then
join its browser room. In the native Show controls, enable experimental collaboration,
select the visitor connection and grant control. In the browser chat/sound panel,
scroll to **Collaborative controls** and select a module and parameter. Adjust the
slider with mouse or keyboard, or drag a visible 3D knob vertically. WebXR uses
trigger hold and controller height; release ends the gesture. Host revoke immediately
returns the visitor to read-only operation. The ordinary 0.5 launcher does not include
these development changes yet.

Exported visible knobs, sliders and switches with bounded native parameter quantities
are eligible, as are input/output ports and identified cables. Momentary switches are
treated as held buttons. There is no remote module insertion/removal or file/menu editing. The module selector
uses native parameter IDs when no readable control label is available. Other visitors
continue to see the canonical audio-aligned state; provisional motion affects only
the editing browser's mesh and never mutates shared snapshots.

Validation: 54 browser/relay tests pass, including stationary controller input after
native snapping, stale replies, coalescing, contention routing, lease renewal and
immutable provisional rendering. The gesture client passes the real-engine loopback
integration probe. A browser UI check against an isolated synthetic publisher verified
grant display, parameter selection and a slider begin/update/end sequence. This
synthetic UI check does not establish DSP or headset performance. Physical WebXR,
large patches, WAN latency and simultaneous real-device performers still need testing.


## Buttons, switches and cables, 2026-10-18

The host's single control grant covers all supported controls and wiring. It is not
restricted to a per-knob allowlist. Ungranted visitors remain read-only.

- Click a switch on the rack to cycle its positions. The cycle starts from the
  host's current value, so a delayed visual snapshot cannot toggle the wrong state.
- Hold a momentary button with the mouse or XR trigger; release ends the press.
  A quick tap still sends a press before release. Expiry, revoke, disconnect and
  local host takeover release the native button to its minimum/rest value.
- Drag an output to an input, or select the two ports in sequence, to connect.
  An occupied input is replaced as one native undo action. Outputs may fan out.
- Select an existing cable or its connected input, then choose another input/output
  to move the corresponding end. Selecting its input again disconnects it. The
  browser panel also provides Cancel selection and Disconnect selected cable.
- WebXR uses trigger selection for cable endpoints; cable edits commit only once
  both endpoints are chosen. Physical controller acceptance remains outstanding.

Cable operations include the displayed native `wiring` version. The native bridge
compares that version with current cable IDs and endpoints before any mutation.
The first accepted edit changes the version; conflicting edits fail without changing
anything and require a new selection. This intentionally serializes conflicting
wiring edits without locking ports throughout a user's unfinished selection. An
unrelated wiring change also invalidates a selection in this initial implementation.
Parameter gestures on other performers' controls remain active during cable edits.

Each connect/move/disconnect is one native undo action. Latching switches use the
existing parameter history boundary; momentary press/release creates no undo action
that could later leave a trigger held high. Cable IDs/endpoints now accompany the
existing visual geometry. Wiring-version changes force fresh visual capture so the
advertised version and geometry describe the same state.

Validation: all 63 browser/relay tests pass. Native tests cover SEQ3 momentary
buttons, SequentialSwitch2's three positions and undo/redo, cable connect/move/remove,
stale versions, malformed targets and a concurrent knob gesture. The real
visitor-client → relay → Godot → Cardinal test uses a received baseline, operates
a knob and button, connects/moves/disconnects a cable, and disconnects while holding
a button; the host verifies cleanup. The native publisher/audio regression passes.
A local synthetic UI fixture verified direct rack clicking and cable dragging in
the browser. This does not certify WAN timing, every third-party custom widget or
physical VR interaction. Custom non-parameter surfaces and module context menus
still require the native performer UI. No public deployment or 0.5 launcher update
is included in this development change.

## Local live preview launchers (2026-10-19)

The sibling workspace contains `Launch Cardinal 3D Live 0.6.bat` and
`Launch Cardinal 3D Live 0.5 Backup.bat`, both with desktop/VR choices. The original
0.5 launcher and native DLL hashes were verified unchanged. The 0.6 frontend and
candidate engine are staged separately in `dist/embedded-0.6`, with a local preview
manifest; this is not a redistributable release build. Each version uses separate
settings, relay session files and private hosting configuration.

`scripts/run_live_version.py` starts the matching relay, refuses to replace an
incompatible running session, and closes its owned relay when the performer exits.
A Windows job object also closes the relay if the launcher console is closed.
The existing Umbrel proxy continues on the same backhaul/port, preserving its piano
application and landing assets. No Umbrel app replacement was necessary.

Validation includes an explicit `check-control-client.mjs --public-session <file>`
probe through the real HTTPS/WebSocket proxy to a disposable native host: knob,
button, cable connect/move/disconnect and held-button disconnect cleanup passed.
Uninvited access was rejected and invited access remained read-only before grant.
The public bundle matched the local 0.6 bundle. The 0.5 relay rollback path also
served successfully through Umbrel. Invitation URLs and access keys remain private.


The current response/rendering revision is documented in [0.6 response fixes](0.6-RESPONSIVENESS.md). Restart the 0.6 launcher and reload visitor pages to use it.
