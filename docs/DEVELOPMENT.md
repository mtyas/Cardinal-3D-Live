# Developing Cardinal 3D Live

Start with [PIPELINES.md](PIPELINES.md), [BUILD-LIVE.md](BUILD-LIVE.md) and
[VALIDATION.md](VALIDATION.md). Live's supported native performer is Windows x64,
using Godot 4.5.1 and the pinned Cardinal engine in-process. Browser visitors use
Three.js/WebXR. The legacy standalone TCP bridge is a separate backend.

## Ownership and boundaries

- `embedded/`: engine lifecycle, audio backends, Show modules and Godot bindings.
  One audio owner advances one engine. Owner-thread UI operations use native Rack
  validation/history; structural edits retain upstream engine synchronization.
- `bridge/Cardinal3DBridge.hpp`: descriptors, commands, surface rendering and
  native history shared by embedded and legacy TCP backends.
- `godot/scripts/`: desktop/OpenXR interaction, rack/cases, environments and show
  publishing. Patch state belongs to Cardinal; case layout uses `.vcv.3d.json`.
- `show-web/`: authenticated relay, Opus worker, immutable scene deltas and browser
  renderer/audio. Visitors cannot edit the patch. Audio remains per-source.
- `scripts/`: pinned fetching, WSL builds, isolated checks and release provenance.

The audio callback reads a fixed three-slot monitor-source handoff. The producer
owns construction/reclamation; the audio consumer never copies a shared pointer.
This handoff is strictly one producer/one consumer and must outlive the callback.
It does not remove upstream engine locks during structural edits.

Show networking drains bounded rings on a separate thread. Stop/join that thread
before closing the engine. Offline draining does not rescan the scene. The relay
returns only audience/chat state to the native publisher; it does not echo the
publisher's own show. Browser visual frames remain immutable for audio alignment.

## Contributing

Keep changes focused and explain the observed problem, resulting behavior, and
validation. Add behavioral regressions for protocol, lifecycle and concurrency
changes. Use temporary settings/patches in tests; do not alter a playing runtime.
Run the checks relevant to your change, plus browser tests for shared protocol
changes. Include the exact build, Godot version, OS, headset/audio device and
reproduction patch when reporting hardware problems. Never publish private show
keys, hosting configuration, recovery state or personal patches.

Preserve the upstream pin and exact audited overlays unless changing them is an
explicit task. Preserve all separate artwork/font/sample notices. Project code
is GPL-3.0-or-later; bundled assets do not all share that licence.

## Performance work

Measure before and after. `scripts/benchmark_foundation.py` measures native block
and scene-poll percentiles under concurrent load. `show-web/benchmark-relay.mjs`
measures local delivery with synthetic visitors. Neither certifies headset
latency or internet capacity. Enable `CARDINAL_3D_DIAGNOSTICS=1` for frame p95/p99,
worst frame, draw calls and snapshot rates. Keep instrumentation opt-in.

See [FOUNDATION-VALIDATION.md](FOUNDATION-VALIDATION.md) for the stages 1–3 results
and remaining acceptance work. Collaborative control and new platform backends
are intentionally subsequent stages.
