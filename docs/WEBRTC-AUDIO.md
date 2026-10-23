# WebRTC audio and collaborative control — 0.6 preview

WebRTC is the preferred audio connection for every browser listener. The
authoritative native Cardinal engine, patch and permission system are unchanged.
The relay forwards its existing 20 ms Opus packets over encrypted RTP; it does
not run another synthesizer or decode/re-encode audio for each listener.

## Trying it

Restart **Launch Cardinal 3D Live 0.6.bat** and reload the invited room page.
Choose **Enable spatial sound**. **Audio connection → Automatic** now prefers
WebRTC for both visitors and invited collaborators. Existing saved 2.5-second
buffering applies only to the buffered stream and does not delay WebRTC.
No microphone or camera access is requested.

Look for **WebRTC · direct** or **WebRTC · TURN relay** in audio status. It shows
network RTT, mean receiver jitter-buffer delay and lost packets. Jitter-buffer
delay is not total engine-to-ear or control-to-sound latency. The browser is asked
for a 40 ms jitter target, but chooses actual buffering according to delivery.
Browser/device audio latency and network distance still apply. Tight rhythmic
ensemble performance across arbitrary distances is not guaranteed.

**Buffered stream** remains an explicit fallback. If connection negotiation or
media fails, status identifies the fallback; the browser retries after ten
seconds while the performance continues. Extra stable remains useful for passive
listeners. Changing the audio connection or pressing Enable sound retries too.

## Paths and permissions

- Existing HTTPS/WebSocket via Umbrel: invitation authentication, SDP negotiation,
  chat, room state and scene deltas. Native PCM travels only over the existing
  dedicated local PCM connection to the relay on the same PC.
- WebRTC media: PC relay directly to browser, or through a configured TURN relay.
  Each virtual speaker remains a separate mono track connected to its existing
  spatial panner. RTP timestamps preserve the 48 kHz native engine timeline.
- WebRTC ordered data channel: existing semantic `control_*` commands/replies.
  It uses the same authenticated socket actor, host grants, sequence checks,
  leases, rate limits and host-side validation as WebSocket controls. A receiving
  client cannot grant itself permission. WebSocket remains the control fallback.
- The browser mutes the buffered graph when WebRTC becomes active and restores
  it on fallback, clearing stale queued sound. It does not play both streams.
  A muted media element per track activates Chromium's remote WebAudio playout;
  only the spatial graph is audible. See Chromium [issue 40094084](https://issues.chromium.org/issues/40094084).
- Lights use the receiver synchronization timestamp when available, unwrapped
  into the native frame timeline. Stale clocks release visuals to current scene
  state. This is an estimate; acoustic/output calibration is not implemented.

Both audio modes share the requested Opus encoders. FEC is enabled with a 5%
expected-loss setting to help WebRTC recover isolated UDP losses. Encoder quality
ceilings still apply. UDP sends do not retain an unbounded stale audio backlog.
There are at most 16 WebRTC listeners by default; additional listeners receive
an explicit capacity fallback. This is a development bound, not a many-listener
load certification. Scaling to a large audience warrants an SFU/media-server
assessment, rather than multiplying DSP engines.

## Network configuration

For the SFR CGNAT deployment, use [Cloudflare TURN setup](CLOUDFLARE-TURN.md).
It requires no incoming router ports. On 21 October the personal 0.6 deployment
was configured and a forced Cloudflare TURN route decoded both audio tracks in
Chrome. Separate-network phone/Mac and musical latency acceptance remain required.

WebRTC signaling uses the existing invitation URL. Media does **not** pass through
the Cloudflare HTTP tunnel or Pi's WebSocket proxy. A successful HTTPS connection
alone therefore does not prove that WebRTC media can connect.

The default STUN server is `stun:stun.cloudflare.com:3478`. The host successfully
gathered a public server-reflexive candidate in validation. Networks with symmetric
NAT or restrictive firewall rules may still require TURN. The personal 0.6
deployment now uses authenticated Cloudflare TURN. Test from a phone on cellular data
and a collaborator on a different internet connection before relying on it.
TURN is a standard [WebRTC connectivity requirement](https://webrtc.org/getting-started/turn-server)
for networks that cannot connect directly.

Add an optional `webrtc` object to the operator's private hosting JSON:

```json
{
  "webrtc": {
    "enabled": true,
    "max_peers": 16,
    "ice_servers": [{"urls": "stun:stun.cloudflare.com:3478"}],
    "turn_urls": ["turn:YOUR-RELAY-HOST:3478?transport=udp"],
    "turn_secret": "YOUR-COTURN-SHARED-SECRET",
    "relay_only": false
  }
}
```

Use an independently reachable TURN endpoint. A TURN listener behind the existing
Cloudflare HTTP tunnel is insufficient. Its firewall, credentials and deployment
must be configured separately. The relay mints one-hour HMAC credentials for the
authenticated actor; the shared secret never goes to the browser. Alternatively,
operator-owned `ice_servers` entries may specify provider credentials. Do not
commit hosting JSON or credentials. Optional `port_range: [min, max]` restricts
host UDP ports when necessary; endpoints must differ. No router/firewall rules
were changed by this implementation. `enabled: false` restores buffered-only
audio. Neither transport permission permits arbitrary patch/menu/file commands.

## Protocol and lifetime

After room authentication, `rtc_available` advertises support. An enabled listener
sends `rtc_request`. The relay sends `rtc_waiting`, `rtc_unavailable` with reason,
or `rtc_offer` containing an opaque negotiation `id`, send-only SDP, ICE
configuration and `{id,mid}` speaker mappings. The client returns `rtc_answer`
with the matching negotiation ID and receive-only SDP after ICE gathering.
Full answers are bounded to 64 KiB; all other guest messages retain the 4 KiB
limit. Guests cannot supply the relay's ICE configuration.

One peer connection belongs to one authenticated room socket. Requests have a
three-second limit, negotiation times out after twenty seconds, and WebSocket
disconnect removes media/control resources and grants. Speaker topology changes,
native clock resets and sample-rate changes replace the media negotiation;
stale answers are ignored. Performance shutdown removes peers. Reconnection
requires the normal room authentication and a fresh host control grant.

The `cardinal-controls` data channel carries only `control_*` JSON up to 4 KiB,
shares the socket's message budget and uses bounded backpressure. It bypasses
visual traffic queues without changing who can mutate the patch. Visual deltas
still use WebSocket and may lag independently on a stalled public connection.

## Validation

Run `npm ci --ignore-scripts` and `npm test` in `show-web` with Node 22.22.2.
All 90 browser/relay tests pass. The WebRTC tests negotiate real ICE/DTLS/SRTP, compare the two received Opus tracks
byte-for-byte and preserve DSP timestamps. The actual data channel exercises
read-only rejection, grants, actor forgery rejection, replies and revocation.
Other tests cover request/capacity bounds, topology replacement, stale answers,
timestamp wrapping and restoration of a single audible path.

With a disposable native animated-stage performance running:

```powershell
node show-web/check-rtc-browser.mjs PATH-TO-PRIVATE-SESSION.json 38000 public
```

This uses installed Chrome in a disposable profile and the real room application.
Set `CARDINAL_TEST_CHROME` to another Chromium executable when needed. It checks
two inbound tracks, decoded samples and nonzero waveform energy, rather than
counting connected sockets as audio success. It also reports concealment and
jitter-buffer statistics. The native fixture includes a 700 ms UI stall.

The first decoded-audio run produced 1,095 packets per track, zero reported
network losses and roughly 49–73 ms mean jitter buffering. Public HTTPS was used
for signaling; media selected a local host route with about 1 ms RTT. **This is
not a WAN latency result.** Separate-network Chrome, macOS/mobile, restrictive NAT,
TURN, physical headset output and action-to-audible-change tests remain acceptance
work. No promise of sub-100-ms internet musical latency follows from this test.

WebRTC uses pinned `werift@0.25.1` (MIT). Its server dependencies and the
MPL-2.0 Mediabunny dependency retain their notices under `legal/WEBRTC-DEPENDENCIES.txt`.
Before packaging corresponding release sources, run
`python scripts/fetch_webrtc_sources.py --output YOUR-RELEASE-DOWNLOADS`.
The normal source packager requires and includes those pinned preferred-source
archives. This preview does not modify the preserved 0.5 build or launcher.

Final verification (21 October): the updated public HTML and hashed browser
bundle matched the local relay. A second real Chrome/native-stage run decoded
two tracks with nonzero waveform energy, zero reported packet losses and about
52–77 ms mean jitter buffering on a local media route. It does not establish
WAN action-to-sound latency. Reconnect-rate behavior was checked separately
after that run; rapid mode changes now receive an explicit retry response.
