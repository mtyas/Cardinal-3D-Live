# Show protocol used by Live

The existing protocol is a host-authoritative presentation stream, not a patch
replication protocol. `show-web/show-protocol.mjs`, `server.mjs` and their tests
are the executable specification. `PROTOCOL.md` describes native command
semantics and the legacy loopback bridge.

## Connections and authority

- Native publisher: local, originless WebSocket `/performer?host=<secret>`.
- Browser: `/room`, approved Origin; invitations required for private public-hosted
  rooms. Public-show entry does not grant editing/publishing rights.
- Assets: same-origin `/show-assets/<sha256>` over HTTP(S).
- Internet transport: HTTPS/WSS through the configured proxy; WebRTC audio and
  an ordered control data channel, with optional TURN (see below). No SFU.

The native publisher owns show state/audio. The relay owns membership, bounded
chat, reactions, rate limits and distribution. A local browser performer preview
occupies the single performer slot but does not edit or run Cardinal.

## Messages

Publisher to relay: `show` (sample frame/rate, sources, visuals and pose), `asset`
(hash, media, base64 data), binary `C3DA` PCM, and ordinary chat/identity messages.

Visitor to relay: `identity`, `pose`, `chat`, `reaction`, `audio_quality`,
`audio_codec`, `client_features` and `scene_resync`. Ordinary visitors cannot edit
the patch. The 0.6 opt-in control extension below requires a separate host grant.

Relay to client: `welcome`, `room`, `room_delta`, `connection_stats` and audio.
A `room_delta` names a base/revision and immutable path replacements. A client
without that base requests `scene_resync`. Native publishers receive `room` with
members/chat but without their own `show`; they do not need to decode deltas.
WebSocket ping/pong handles connection liveness. Current clients reconnect by
re-entering/restarting publishing; no editing-session replay is implemented.

## State and limits

Show state uses a native DSP frame, sample rate, speaker/light/object/board lists,
head/hands and visual rack projection. The projection includes cases, panel
matrices/controls/artwork hashes and geometric cable endpoints. It does not
include a complete editable patch or plugin state. Version 0.6 additionally exports
cable IDs and endpoints for validated wiring operations.

The optional `session_title` is a host-only string of at most 80 Unicode code
points without C0/DEL control characters. It travels in full snapshots and scene
deltas and becomes the shared board heading; absent/empty titles retain the
legacy MAIN CHAT heading. New visitors receive the current title with the scene.
The public homepage exposes it only while the host enables public listing, and
public performance history stores it when that performance starts. Renaming a
private rehearsal never publishes its title on the homepage.

Case transforms and module membership come from the same physical layout in
desktop and VR. Splitting cases changes the presentation, not the DSP patch.
Visitors/collaborators still cannot publish replacement show states or titles.

Current limits include 32 speakers, 32 lights, 64 visual objects, 16 chat boards,
128 exported panels, 512 exported cables, a 512 KiB show message and a 64 MiB
relay asset budget. Missing assets retry at the browser. Asset transfer lacks
application-level acknowledgement; continuous live-screen publishing and cache
eviction remain future work. Panel export cache resets when native generation
changes. Do not silently raise limits without representative load tests.

The host publishes nominally 30 Hz; rack descriptor capture is gated at 200 ms
and also triggered by control/wiring changes. Live values use compact deltas. Relay delivery
is 20 Hz, about 10 Hz in data-saving mode. Slow sockets skip state/audio rather
than growing unbounded queues. Initial/recovery state remains a full snapshot.

## Audio and timing

`C3DA`: magic, source count, then source ID (uint64), DSP frame (uint64), rate
(uint32), sample count (uint32), mono float32 samples; little-endian fields.
`C3DO`: analogous source packets with Opus payload byte count and bitrate.
The worker resamples to 48 kHz and encodes 20 ms frames at 64/96/128 kb/s.

AudioWorklets buffer per-source playback; HRTF panners spatialize it. Immutable
visual states are selected against the audible frame. This aligns each visitor's
presentation with its own audio, not all devices to a single wall-clock instant.
Source anchoring and moving-source spatial timing need further acceptance tests.

## 0.6 experimental control extension

On the existing authenticated native socket, `control_session` establishes an
epoch, `control_grant` grants a connected actor and `control_revoke` revokes it.
The relay sends private `control_permission` messages to the host and selected
visitor with an opaque grant token. No client can grant itself permission.

A granted socket may send `control_action` with `epoch`, `grant`, increasing
`sequence`, `action` (begin/update/end), `module` (decimal string), and `parameter`
(integer). Update/end also require the lease returned by begin; update carries
`value` in [0,1]. Relay-supplied `actor` identifies the connection; any client
actor is ignored. The host returns `control_result` with the matching grant,
epoch and sequence, acceptance/reason, and canonical value/revision where applied.
Permissions advertise `window:3` for a maximum of three outstanding updates on the
same leased parameter. Begin/end and cable edits are barriers. Clients default to
one outstanding request when this field is absent. Requests remain globally rate limited. See
[0.6 collaboration](COLLABORATION-0.6.md) for limits and recovery.

The host UI is opt-in. The browser visitor supports granted knob/slider/button/switch and cable edits;
the native Godot remote client and a complete structurally editable baseline remain
pending. Never expose native pointer/file/menu operations through this path.

Show snapshots add `control_epoch` and `control_revision`. The host recaptures rack
values whenever either changes, so a revision cannot advertise values from an older
capture. The client requires a matching epoch and visible supported parameter descriptor
before beginning. It retains a provisional mesh value until the audio-aligned
displayed snapshot reaches the acknowledged revision, with a bounded recovery timeout.
These fields travel through existing full snapshots and scene deltas.

The gesture client coalesces input, permits the negotiated bounded update window, spaces requests
by at least 50 ms, and renews stationary grabs every 400 ms. Canonical snapped values
are retained when physical input stays still. `control_abandon` lets a visitor drop
its own grant on timeout, removed targets or unrecoverable rejection; the relay
notifies the host to release its lease. Reconnection requires a new explicit grant.


`control_action` also accepts `cable_connect` and `cable_disconnect`. Both require
`wiring` (the decimal-string version from the displayed snapshot), `input_module`
and `input_port`. Connect additionally requires `output_module` and `output_port`,
with optional `replace_cable` to move an identified cable. Disconnect requires
`cable_id`. Module/cable IDs are decimal strings; port IDs are integers 0–65535.
The same private grant, sequence, in-flight limit and global rate limit apply.
The relay strips fields outside this operation's allowlist. The host validates
ports, cable identity/endpoints, patch generation and wiring version before mutation.
Replies include the resulting `wiring` and control revision. Rejected cable edits
are not automatically replayed against a newer wiring version.

Switch descriptors carry `min`, `max`, `momentary` and `normalized`. Begin replies
include the current native normalized value. The browser cycles a latching switch
from this value or sends the maximum for a momentary press. Native cleanup restores
momentary switches to their minimum on end, timeout, revoke or host takeover; each
lease release advances the host revision to publish that restored state.


## 0.6 WebRTC transport

WebRTC is now the preferred audio transport for every enabled browser listener.
The existing authenticated room socket negotiates receive-only audio, with one
track per native speaker. The same grants and semantic control protocol can use
an ordered WebRTC data channel. WebSocket audio/control remains a fallback.
See [WebRTC audio and controls](WEBRTC-AUDIO.md) for exact signaling, limits,
TURN configuration, clock mapping and validation boundaries.


### Compact visual values and dedicated local PCM

Native 0.6 publishers can use `/performer-audio?host=...` for PCM on a second
authenticated loopback-only connection. It does not join the room. Browser origins
and remote publishers are rejected. Legacy binary PCM on `/performer` remains
supported. Native show frames may omit `visuals` to retain the previous baseline
and provide `visual_values: [{module, values: {kind,id,...changed fields}}]`. The
relay validates and immutably merges numeric/control/meter fields into known
controls; unknown targets are ignored. Dynamic meter `levels` contain six finite
normalized values: peak L/R, RMS L/R, hold L/R. Full descriptions still arrive
periodically and after structural changes. See [optimization notes](0.6-OPTIMIZATION.md).
