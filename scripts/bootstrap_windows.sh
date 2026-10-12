#!/usr/bin/env bash
# Source from a build script after fetching Cardinal. Upstream bootstraps are
# idempotent and retain their own caches; no other Cardinal checkout is needed.
export PAWPAW_SKIP_QT=1 PAWPAW_SKIP_LTO=1 PAWPAW_FAST_MATH=1
export PAWPAW_CI=1 PAWPAW_SKIP_TESTS=1
export PAWPAW_SKIP_GLIB=1 PAWPAW_SKIP_LV2=1 PAWPAW_SKIP_OPENSSL=1 PAWPAW_SKIP_SAMPLERATE=1
if [[ "${CARDINAL_3D_INSTALL_BUILD_DEPS:-0}" == 1 ]]; then
    ./deps/PawPaw/.github/workflows/bootstrap-deps.sh win64
fi
# The corresponding-source archive includes dependency tarballs. Seed the
# upstream download cache; its normal checks still control extraction/building.
if [[ -d "$root/dependency-sources" ]]; then
    mkdir -p "$HOME/PawPawBuilds/downloads"
    find "$root/dependency-sources" -maxdepth 1 -type f -exec cp -n {} "$HOME/PawPawBuilds/downloads/" \;
fi
./deps/PawPaw/bootstrap-common.sh win64
./deps/PawPaw/bootstrap-plugins.sh win64
