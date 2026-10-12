# Building Cardinal 3D Live locally

The public repository contains project/overlay sources and exact upstream pins. The complete release source archive additionally contains recursive Cardinal sources, Godot bindings, GPL ASIO SDK and dependency sources. Use that archive when rebuilding without relying on upstream source availability.

## Windows native build

The supported development path is a Linux/WSL MinGW cross-build with caches on the Linux filesystem. Python 3, Git, rsync, make, scons, MinGW POSIX compilers and the pinned dependency toolchain are required. See `scripts/build_embedded_windows.sh` for installation/build details and `upstream.lock.json` for the Cardinal/Godot pins.

On Windows, create your own WSL distribution and use:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/build_local_windows.ps1 -Distribution YourBuildDistribution -FullRegistry
```

The driver uses a separate full-registry cache, installs the audited overlay, builds the engine/bindings and copies output to `dist/embedded-full`. It retains compiler caches for incremental rebuilds. It does not require Docker. The first build takes substantially longer than incremental builds.

The build uses the GPLv3 option of the pinned official ASIO SDK. `scripts/fetch_asio.py` verifies its checksum. Individual module DSP is unchanged except the audited Host Audio capture cursor correction; `tests/source_audit.py` checks this against pinned sources.

## Browser/server

Install Node.js 22 and run:

```powershell
cd show-web
npm ci --ignore-scripts
npm test
npm start
```

The visitor client is bundled at server startup with pinned esbuild. It contains Three.js and the browser Opus fallback, with all dependency notices preserved. The server injects an immutable, hash-named bundle URL; worklet files and room HTML are served by the same origin.

## Validation and packaging

Run the full engine/library checks against your build using `scripts/check_embedded.py`, and the desktop/XR frontend checks with `scripts/check_frontend.py` and pinned Godot. `tests/frontend_desktop.gd` exercises toolbar sizing and arrow navigation. Audio-device/spatial-monitor tests are under `tests/`.

Use `scripts/package_live_windows.py` with the native build, pinned Godot executable, Node executable and their notices. It copies a clean factory runtime, web dependencies and guides, imports the Godot resources, then generates launchers, provenance and checksums. It never packages user recovery, private hosting files or session keys.

Use `scripts/package_release_sources.py` with recursive Cardinal, binding and dependency source directories to produce the matching source archive. Supply the exact browser decoder sources recorded in `dependencies.lock.json`. Keep the binary/source archives together when distributing.

The repository's CI runs browser tests. Hardware/GPU/audio acceptance and release packaging are performed separately; an automated browser pass does not certify every audio interface or headset.
