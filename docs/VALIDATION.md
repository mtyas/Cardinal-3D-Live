# Validation for Cardinal 3D Live

Use the pinned Godot 4.5.1 and Node 22.22.2. Preserve the installed show runtime;
validate development outputs with temporary settings.

## Automated checks

```text
python tests/release_checks.py
python tests/source_audit.py
node --test show-web/*.test.mjs
python scripts/check_frontend.py <Godot.exe> tests/frontend_desktop.gd
python scripts/check_frontend.py <Godot.exe> tests/frontend_xr.gd
python scripts/check_frontend.py <Godot.exe> tests/frontend_layout.gd
python scripts/check_frontend.py <Godot.exe> tests/frontend_hardware.gd
python scripts/check_frontend.py <Godot.exe> tests/frontend_foundation.gd
python scripts/check_frontend.py <Godot.exe> tests/control_authority.gd
python scripts/check_frontend.py <Godot.exe> tests/show_space.gd
python scripts/check_frontend.py <Godot.exe> tests/xr_keyboard.gd
python scripts/check_embedded.py --build dist/embedded-full --resources dist/embedded-full/Cardinal --godot <Godot.exe> --minimum-models 1400 --graphics
python scripts/check_show.py --godot <Godot.exe>
python tests/show_host.py
python tests/spatial_monitor.py
python tests/parameter_edit.py --dll <candidate-engine.dll> --resources <Cardinal-folder>
```

Run npm tests from `show-web` when your shell does not expand the Node glob above.
`source_audit.py --source <Cardinal>` supports both Git checkouts and extracted
matching source archives. The frontend runner imports a disposable copy, isolates
settings/logs, and treats script errors, missing success markers and timeouts as
failures. Desktop checks automatically use a real graphics viewport. XR tests
simulate input; they do not certify a physical headset.

`show_publish.gd` needs a running isolated relay plus native extension/resources
and a Show patch. It is an integration test, not a standalone frontend test.
The frontend runner requires `--integration` and `--project <prepared-project>`
for that case. Never supply your normal recovery directory to a test.

`tests/control_native.gd` similarly requires a prepared project containing the
candidate DLL and extension, `CARDINAL_EMBEDDED_RESOURCES`, and the frontend
runner's `--graphics --integration --project <prepared-project>` flags. It creates
its patch and settings in the runner's temporary directory and does not publish.

The three-slot handoff stress test needs a C++11 compiler:

```sh
g++ -std=c++11 -O2 -pthread tests/realtime_snapshot.cpp -o /tmp/cardinal-snapshot
/tmp/cardinal-snapshot
```

CI runs browser tests, release-guard regressions, the C++ handoff test and privacy
checks. Native Windows builds and physical headset/device acceptance remain
separate until a suitable CI runner is provisioned.

## Measurement

```text
python scripts/benchmark_foundation.py --dll <engine.dll> --resources <Cardinal-folder> --report reports/native.json
node show-web/benchmark-relay.mjs 32 10 reports/relay.json
```

Record p95/p99/max callback times and misses against the configured block deadline,
scene-processing time, startup, connected visitors, bytes and queued output.
The native benchmark is unpaced stress without hardware; the relay probe runs
synthetic clients on localhost. Use real headsets and remote connections to assess
GPU frame-time stability, perceptual latency, packet loss and long sessions.
`CARDINAL_3D_DIAGNOSTICS=1` adds frame percentiles, worst frame, draw calls and
snapshot rates to the existing diagnostics.

Required release acceptance: large patches; repeated load/add/delete; control
and cable gestures; audio input-only patches; monitor orientation; source removal;
visitor reconnect/resync; slow visitors; 44.1/48 kHz; sustained headset use and
actual supported audio devices. Keep logs and reproduction patches with reports.


## 0.6 WebRTC preview — 21 October 2026

90 browser/relay tests pass, including real two-track ICE/DTLS/SRTP and authorized
control data-channel round trips. Real Chrome decoded nonzero audio from the
authoritative native animated-stage fixture through the public room's signaling
path. Media selected a local route: mean jitter buffering about 52–77 ms, zero
reported network losses. This is not an internet action-to-sound measurement.
Public HTML/hash verification passed; separate-network, phone/Mac and TURN
acceptance testing remain. See [WebRTC audio](WEBRTC-AUDIO.md).
