# Embedded Cardinal engine

The Live Windows performer runs Cardinal inside Godot through
`Cardinal3DExtension.dll` and `Cardinal3DEngine.dll`. There is no second Cardinal
process or DSP replica in this target. The registry includes the pinned upstream
modules plus the seven project-owned Show modules (1,419 models in the audited
full build).

See [build instructions](../docs/BUILD-LIVE.md),
[architecture](../docs/DEVELOPMENT.md) and [checks](../docs/VALIDATION.md).

`Host.h` exposes an owner-thread UI/patch interface and a separately callable DSP
entry point. Godot audio or the Windows device backend owns playback, never both.
Native parameter/cable/history semantics stay in Rack. DSP changes to upstream
module sources are limited to the audited Host Audio capture-cursor correction.

`RealtimeSnapshot.hpp` transfers monitor source lists through three fixed slots.
The audio thread reads a stable immutable vector; only the owner thread assigns
vectors or releases source ownership. The consumer must be stopped before host
destruction. Show audio uses independent preallocated rings; network draining
must finish before destruction too.

Original SVG panels and native NanoVG live surfaces are rendered in Cardinal's
hidden graphics context; Windows restores the calling WGL context. This is a
platform boundary to adapt when adding macOS/Linux hosts, not a portable native
host today. The browser visitor is an independent renderer without a DSP engine.

Run `scripts/check_embedded.py --graphics` against a staged build before freezing
or packaging it. It uses temporary settings and silent audio. Hardware listening,
XR comfort and worst-case structural-edit latency still require acceptance tests.
