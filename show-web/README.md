# Show room prototype

Local preview and invitation-protected internet pilot; see [the feature status and implementation plan](../docs/SHOW-MODE.md).

```
npm ci
npm test
npm start
```

Open the addresses printed by the server. The host URL is local and ephemeral, generated on each server start. The server binds only to 127.0.0.1. Chat and presence work; native per-source audio and light streaming are available through the Show test; the internet pilot adds an HTTPS proxy route and visitor invitations.

All browser libraries are served locally from pinned npm dependencies. This project is GPL-3.0-or-later. Three.js and ws are MIT-licensed; their original licence texts are in `THIRD-PARTY-LICENSES.txt` and the installed packages. Imported assets remain subject to their authors' licences and are not redistributed by this prototype.

## Native performer test

Run **Launch Show performer test.bat** in the workspace folder, after opening
**Launch Show web preview.bat**. The separate test build starts with a VCO, two
Show Speakers and a CV light on first launch. It stores recovery/settings in
`show-user`, leaving the v0.77 launcher and `standalone-user` intact.

Join the visitor URL and choose **Enable spatial sound**. Walk left/right to hear
the separate source positions. Change the VCO or the Show Light controls in the
performer app. Its **Show & broadcast** menu adds speakers/lights, starts/stops
the connection and sets the compressed-quality ceiling.

Current audio uses Opus at 64 / 96 / 128 kb/s per mono source on browsers with WebCodecs Opus support. Visitor quality choices are active, capped by the performer. Automatic chooses 96 kb/s and reduces to 64 kb/s under relay queue pressure. Encoding runs in a separate Node worker, away from native DSP and chat handling. Browsers lacking Opus decoding use PCM for local testing.

A roughly 180 ms audience buffer separates network listening latency from the performer's local audio. Each stream uses its own browser HRTF panner. Lighting follows the audible sample clock. Native PCM is timestamped at the DSP rate; the relay resamples to 48 kHz and publishes 20 ms Opus packets with converted sample timestamps.

The internet pilot uses secure WebSockets through Umbrel and Cloudflare Tunnel. WebRTC/SFU delivery, imported assets and 100-listener load tests remain pending. Live native rack artwork, control/LED states, cables, cases and procedural scenery are now shared.

Run `npm test` to check chat/appearance permissions, source validation, worklet buffering, actual Opus encode/decode, resampling, quality ceilings and a real relay connection.

## Phone, tablet and visitor VR controls

Phones/tablets get a translucent bottom-left joystick. Hold it to walk; drag elsewhere in the scene to look. The two gestures can be used together. **Chat & sound** opens the compact chat/settings panel, which starts closed so it does not obstruct navigation.

**Save mobile data** starts enabled on touch devices. Automatic audio uses 64 kb/s per mono speaker, scene updates arrive at 10 Hz and render resolution is reduced. Manual 64/96/128 kb/s choices remain available, subject to the performer's ceiling. The mobile audio buffer is 300 ms rather than 180 ms, with late-packet recovery; visuals still follow the audible audio timeline. The live-stream rate display measures the server's transmitted WebSocket bytes after compression, excluding initial HTTP artwork downloads.

Audio is not transmitted to a visitor until they enable it. Browsers without native WebCodecs Opus use the bundled WebAssembly decoder in workers, preserving compressed spatial sources. Scene deltas avoid repeatedly transmitting unchanged rack geometry/artwork descriptions. Full snapshots are sent on entry or resync; older clients remain compatible. WebSocket text compression provides additional savings.

In visitor VR:

- **B/Y** hides or shows the chat/sound HUD. **Grip + B/Y** recalls it in front of you.
- Hold the trigger on its title bar to carry and rotate the HUD. While holding it, stick up/down changes its distance. Release to place it; the position is remembered locally.
- Use **Recenter** to bring the panel back in front of you.
- **Enable spatial sound** and the **Quality** button work directly in the 3D panel.
- Tap **Write a message** for the virtual keyboard. It includes shift, symbols, space, backspace and Send. Physical keyboard input also works while the virtual keyboard is open.

The visitor controls, delta reconstruction, compressed decoder (including its minified worker), no-audio-before-enable behaviour, rate selection and jitter recovery have automated checks. Phone ergonomics and Quest browser interaction still need device testing.
