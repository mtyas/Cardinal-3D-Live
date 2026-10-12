# Foundation stages 1–3: validation record

Date: 2026-10-12. Baseline: `5e7a4ca664b9a28c077d156dac44338984c872ca`.
Candidate: working-tree changes following that baseline; no release was produced.

## Delivered changes

- Correct browser control visibility/removal and reused panel dimensions; reset
  native panel texture caches when the patch generation changes.
- Move monitor-source snapshot reclamation to the producer using a fixed
  single-producer/single-consumer handoff. Avoid republishing unchanged membership.
- Remove the full Show echo to the publisher, cache room parsing by revision,
  avoid offline scene refresh while draining audio, retain unchanged Godot cable
  geometry, and skip repeated browser rack updates for the same immutable frame.
- Add isolated frontend/integration runners, repeatable native/relay benchmarks,
  optional frame percentiles, source archive checks and native build fingerprints.
- Remove the full build's dependency on another local vendor checkout; bootstrap
  pinned dependencies explicitly. Require matching source metadata, native inputs,
  runtime versions and notices before release packaging. Update architecture,
  protocol, contribution and build instructions.

The existing authoritative engine and visitor protocol remain the foundation.
Remote editing, new device backends and a distributed state system are not part
of this change.

## Verification

- Browser suite: 43/43 passed, including the actual relay, codec and asset build.
- Release/source guard regressions: 3/3 passed; native build fingerprint passed.
- C++ handoff stress: 100,000 publications passed, including producer-only
  destruction and coherent consumer snapshots.
- Windows full native build succeeded using the existing WSL dependency cache.
- Isolated Godot desktop, simulated XR, layout, hardware, foundation, shared-space
  and keyboard checks passed.
- Actual Godot/native publisher to relay to visitor passed, including a deliberate
  700 ms UI stall and module-browser interaction: 136 audio packets, 999,424 frames,
  two sources, active CV lighting and a maximum observed packet gap of 99.08 ms.
- The existing source archive's 41,315 Cardinal files verified without Git metadata,
  both before and after applying the idempotent bridge/Host Audio overlay.
- Git whitespace check passed. Installed runtime and existing releases were not
  replaced; the rebuilt development output is `dist/embedded-full`.

Windows sandbox restrictions initially prevented esbuild path resolution and
Godot certificate-store access. Both suites passed with approved access. A
temporary approval-service usage-limit failure delayed the archive check; the
subsequent approved retry passed.

## Measurements

Local synthetic relay probe: 32 visitors, five seconds, 64 panels and 2,560
controls, two audio sources, with half the visitors using low-data mode.
Counts are application payload bytes, not wire-level TLS/TCP bandwidth.

| Measurement | Baseline | Candidate |
| --- | ---: | ---: |
| Relay bytes returned to publisher | 17,793,782 | 619,398 |
| Visitor scene bytes, all visitors | 6,222,373 | 6,241,605 |
| Visitor audio bytes, all visitors | 3,061,376 | 3,073,984 |
| Connected visitors | 32 | 32 |

Removing the redundant scene echo reduced host return traffic by about 96.5%.
Visitor traffic is essentially unchanged; short runs have slightly different
packet counts. This is not an internet capacity or maximum audience estimate.

Native unpaced concurrent stress: 16 sources, 4,000 blocks; deadline 5.333 ms.

| Audio block time | Baseline | Candidate |
| --- | ---: | ---: |
| p50 | 0.0870 ms | 0.0882 ms |
| p95 | 0.1024 ms | 0.1028 ms |
| p99 | 0.1303 ms | 0.1791 ms |
| Maximum | 0.2710 ms | 0.2986 ms |
| Deadline misses | 0 | 0 |

These single-run timings do not demonstrate a callback speedup. The handoff's
benefit is removing shared-pointer reference counting and possible destruction
from this callback path. Structural editing still uses upstream synchronization.

## Remaining acceptance and limits

A full build in a pristine WSL distribution has not been executed. The cached
build and extracted-source check do not establish clean-machine reproducibility
or bit-identical binaries. Release preflight checks archive metadata and native
fingerprints; it is not a cryptographic attestation of a complete toolchain.

Physical headset frame times, extended audio-device sessions, internet loss and
latency, large-patch structural edits and sustained audience load still require
hardware acceptance. Simulated XR tests do not certify controller compatibility.
No GPU performance improvement is claimed.

Live asset acknowledgment/eviction, shared audio time anchors, moving-source
panner timing and full native snapshot costs remain follow-up work. Collaborative
performers still need host-validated semantic commands, bounded grab ownership,
disconnect cleanup and resynchronization; visitors remain read-only.

Reproduction commands are in [VALIDATION.md](VALIDATION.md); local raw benchmark
reports are under ignored `reports/`. Release packaging deliberately requires a
clean committed checkout and matching source archive.
