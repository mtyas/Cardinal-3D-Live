# Building Cardinal 3D Live

The project pins Cardinal and its recursive submodules in `upstream.lock.json`,
Godot 4.5.1, bindings and codec sources in `dependencies.lock.json`, and exact web
packages/integrities in `show-web/package-lock.json`.

## Windows native build from a fresh checkout

Use a dedicated Debian/Ubuntu WSL distribution and keep the compiler cache on
its Linux filesystem. The checkout on Windows may contain spaces; the staged
Linux build path must not. Install the prerequisites inside that distribution:

```sh
sudo apt-get update
sudo apt-get install -y python3 python3-venv git rsync make scons \
  autoconf automake autopoint build-essential curl cmake file jq \
  libglib2.0-dev-bin libtool lsb-release meson gperf patchelf pkg-config \
  uuid-dev zlib1g-dev libffi-dev libreadline-dev mingw-w64
```

The native build uses MinGW's POSIX compiler variant. If your distro's CMake is
older than the pinned 3.31.8, install that version in a Python virtual environment
and put its `bin` directory on the build PATH. The alternative upstream OS package
installer is opt-in through `CARDINAL_3D_INSTALL_BUILD_DEPS=1`; it can also install
Wine and i386 packages. The normal build does not modify OS packages.

From the project checkout in PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/build_local_windows.ps1 -Distribution YourBuildDistribution -FullRegistry
```

The driver stages to `/root/cardinal3d-full`, fetches the exact Cardinal commit
and recursive gitlinks, verifies/fetches the GPL-option ASIO SDK, installs the
project overlay, bootstraps PawPaw dependencies, and builds engine/bindings/assets.
It no longer needs `/root/cardinal3d/vendor` or another project's build cache.
`-BuildRoot /root/cardinal-live-clean` selects a separate source/build directory.
PawPaw retains its separate upstream dependency cache under `~/PawPawBuilds`.

Output is `dist/embedded-full`; an installed performance runtime is never
replaced. `BUILD-MANIFEST.json` fingerprints native source inputs and DLL outputs.
Run [validation](VALIDATION.md) before running or distributing the build.

Directly from a Linux checkout without spaces, with those dependencies installed:

```sh
CARDINAL_EMBEDDED_FULL=1 CARDINAL_EMBEDDED_GRAPHICS=1 bash scripts/build_embedded_windows.sh
python3 tests/source_audit.py
```

The first build downloads substantial source and compiles the complete registry.
Exact source pins do not imply byte-identical binaries across compiler versions.
Record distro, compiler, CMake and SCons versions when reproducing a release.

## Corresponding-source archives

GitHub's automatic ZIP is not complete. Use the matching release source archive
for recursive Cardinal, bindings, ASIO and codec/dependency sources. Extract it
into a fresh directory. The WSL driver can stage its supplied vendor/binding/SDK
sources, and bootstrap seeds PawPaw's download cache from `dependency-sources`.
The source audit verifies archive hashes without requiring `.git` directories.
Toolchain installation and any dependencies absent from that archive can still
require network access; this is not a claim of a fully offline toolchain image.

## Browser and relay

Install Node 22.22.2, then:

```sh
cd show-web
npm ci --ignore-scripts
npm test
npm start
```

The server bundles its browser entry point with pinned esbuild at startup.
See [HOSTING.md](HOSTING.md) for invitations, HTTPS/WSS and optional welcome proxy.
The native performer publishes locally; exposing the native host key remotely is
not a collaboration feature.

## Release preparation

Use a clean committed project checkout. Build the native output from those same
inputs. Fetch the exact recursive browser/server codec sources and create the
matching archive first:

```text
python scripts/package_release_sources.py --cardinal <recursive-Cardinal> --bindings <godot-cpp> --downloads <dependency-tarballs> --decoder <wasm-audio-decoders> --opusscript <opusscript> --output <matching-source.tar.gz>
python scripts/package_live_windows.py --build dist/embedded-full --godot <Godot-4.5.1.exe> --node <Node-22.22.2.exe> --source-archive <matching-source.tar.gz> --check-only
```

Remove `--check-only` to create a new portable release directory and ZIP. Preflight
rejects a dirty project, stale/missing native fingerprints, modified DLLs, wrong
runtime versions, missing web dependencies/notices and mismatched source pins.
It also exercises the installed esbuild executable. Run `npm ci` on the packaging
platform; do not copy Linux `node_modules` into a Windows release.

Keep binary/source archives and notices together. Packaging records the source
archive checksum. Run privacy checks on the final unpacked output and perform
hardware acceptance separately. Do not infer hardware certification from CI.
