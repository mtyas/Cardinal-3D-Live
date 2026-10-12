#!/usr/bin/env bash
set -euo pipefail
source_path="$1"
jobs="${2:-4}"
export CARDINAL_3D_BUILD_JOBS="$jobs"
build_root="${CARDINAL_3D_BUILD_ROOT:-/root/cardinal3d}"
output=embedded
if [[ "${4:-runtime}" == embedded-full ]]; then
    build_root="${CARDINAL_3D_BUILD_ROOT:-/root/cardinal3d-full}"
    output=embedded-full
    mkdir -p "$build_root"
    export CARDINAL_EMBEDDED_FULL=1 CARDINAL_EMBEDDED_GRAPHICS=1
fi
mkdir -p "$build_root"
# Keep make inputs off the Windows filesystem and retain all dependency caches.
rsync -a --exclude=.git --exclude=vendor --exclude=build --exclude=dist \
    --exclude=.tools --exclude=setup --exclude=.godot --exclude=__pycache__ \
    "$source_path/" "$build_root/"
cd "$build_root"
# Complete release sources can be staged without Git or an existing vendor cache.
if [[ ! -d vendor/Cardinal && -f "$source_path/vendor/Cardinal/.source-snapshot.json" ]]; then
    mkdir -p vendor
    rsync -a "$source_path/vendor/Cardinal/" vendor/Cardinal/
fi
for dependency in godot-cpp asio-sdk; do
    if [[ ! -d ".tools/$dependency" && -d "$source_path/.tools/$dependency" ]]; then
        mkdir -p .tools
        rsync -a "$source_path/.tools/$dependency/" ".tools/$dependency/"
    fi
done
sed -i 's/\r$//' scripts/*.sh
if [[ "${3:-False}" == True ]]; then exit 0; fi
if [[ "${4:-runtime}" == embedded* ]]; then
    if [[ "$4" == embedded-graphics ]]; then export CARDINAL_EMBEDDED_GRAPHICS=1; fi
    bash scripts/build_embedded_windows.sh
    python3 tests/source_audit.py
    mkdir -p "$source_path/dist/$output"
    # Preserve timestamps so cached rebuilds don't rewrite thousands of SVGs
    # across the Windows mount. Only changed binaries/scripts/assets are copied.
    rsync -rt --modify-window=1 dist/embedded/ "$source_path/dist/$output/"
    exit 0
fi
CARDINAL_3D_BUILD_JOBS="$jobs" CARDINAL_3D_INSTALL_BUILD_DEPS=1 bash scripts/build_windows.sh
python3 tests/source_audit.py
mkdir -p "$source_path/dist"
# Windows merges Godot/ and godot/ names; copy the zip instead of the Linux tree.
cp dist/Cardinal-3D-Windows.zip "$source_path/dist/"
