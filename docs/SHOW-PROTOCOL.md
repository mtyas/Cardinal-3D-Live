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
- Internet transport: HTTPS/WSS through the configured proxy. No WebRTC/SFU.

The native publisher owns show state/audio. The relay owns membership, bounded
chat, reactions, rate limits and distribution. A local browser performer preview
occupies the single performer slot but does not edit or run Cardinal.

## Messages

Publisher to relay: `show` (sample frame/rate, sources, visuals and pose), `asset`
(hash, media, base64 data), binary `C3DA` PCM, and ordinary chat/identity messages.

Visitor to relay: `identity`, `pose`, `chat`, `reaction`, `audio_quality`,
`audio_codec`, `client_features` and `scene_resync`. There is no synth-edit action.

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
include a complete editable patch, plugin state, or authoritative cable IDs.

Current limits include 32 speakers, 32 lights, 64 visual objects, 16 chat boards,
128 exported panels, 512 exported cables, a 512 KiB show message and a 64 MiB
relay asset budget. Missing assets retry at the browser. Asset transfer lacks
application-level acknowledgement; continuous live-screen publishing and cache
eviction remain future work. Panel export cache resets when native generation
changes. Do not silently raise limits without representative load tests.

The host publishes nominally 30 Hz; rack capture is gated at 50 ms. Relay delivery
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

Collaboration will require an authenticated command path, target identities,
leases, acknowledgements, session epochs and an editable baseline. Do not expose
native pointer/file/menu commands merely by adding a browser role flag.
