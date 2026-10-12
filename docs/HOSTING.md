# Hosting your own shows

## Local rehearsal

Run the portable Show server and one performer. The server prints its local visitor URL. It binds to loopback by default; the performer connects locally using an ephemeral private session key. Enable broadcasting from Show & broadcast. For phone/WebXR visitors use an HTTPS public hostname as described below.

## Public topology

Use a Windows performance PC, an optional always-on Umbrel/server, a private backhaul such as Tailscale, and an HTTPS reverse proxy such as Cloudflare Tunnel. No specific personal hostname or network addresses are supplied.

Example addresses in this guide are placeholders:

| Component | Example |
| --- | --- |
| Public hostname | `https://live.example.org` |
| PC private backhaul | `100.64.0.20:8878` |
| Welcome host backhaul | `100.64.0.10` |
| Welcome host LAN | `192.168.1.10:8788` |

1. Connect the PC and welcome host to your private network.
2. Put a private `hosting.json` in the performer's versioned data directory. Set your HTTPS origin, `bind` to `0.0.0.0`, `port` to `8878`, and `proxy_address` to the welcome host's real backhaul IP. Generate a random 24-byte hex `invite_token`; do not use an example token. The source helper `scripts/run_show_internet.ps1` can generate one. Keep the file out of Git.
3. Allow port 8878 through the PC firewall only from the welcome host's backhaul address. The relay additionally checks the peer address and visitor origin/invitation. The native publishing endpoint remains local.
4. Start the PC server, then the performer. The server generates its private session file. The portable launchers use the same file; do not publish its host URL/key.
5. Run the welcome service on the always-on host, configured with your PC backhaul URL and public origin. Use [the compose example](../deploy/welcome.compose.yml), or `scripts/umbrel_portal_admin.py` with your own Portainer URL and a private access-key file.
6. Point the public HTTPS tunnel to the welcome host's HTTP service on port 8788. Forward WebSocket upgrades. The welcome service proxies live media to the PC and serves the homepage independently when the PC is off.

The welcome container uses a persistent volume and `unless-stopped`. The hosting platform/Portainer, backhaul and tunnel should also start automatically. Do not reboot a shared home server just to test this service; its own container can be restarted independently.

## Profile and performance history

Edit `show-web/show-profile.json` before deploying your homepage: artist, biography, website, title, past/upcoming shows and optional Telegram channel. The shipped profile is generic. Public performances are automatically logged by the relay; private rehearsals are excluded. The welcome service retains the latest completed-show list between performances.

History contains titles/dates/duration, not audio or video recordings. Stop broadcasting and allow approximately ten seconds for the welcome service to copy the latest list before shutting down the PC.

## Optional Telegram announcements

Create a public channel and a bot through Telegram's BotFather. Add the bot as a channel administrator with posting permission. Privately configure `telegram.json` in the welcome data volume with `channel` and `botToken`. The Portainer helper can verify permission and install this file without sending a test post.

Visitors follow the channel through Let me know. A public show start triggers a single announcement for its durable show ID; rehearsals do not post. The bot token must never be stored in the public profile, source tree or browser bundle. Review uncertain delivery records manually rather than automatically reposting them.

## Operating a performance

Keep the welcome host, private backhaul and tunnel running. Start the PC relay; for VR also connect Meta Horizon Link/Quest Link before starting the performer. Confirm audio input/output and the visitor mix, then enable Public show only when ready. Private invitations allow rehearsals without announcements.

Visitors enter over HTTPS and enable sound. Invite a small group before increasing attendance. The alpha's configured capacity is not a load certification; source count, upload, encoding, client CPU and proxy conditions affect the experience.

Protect administrative interfaces and access keys, keep source/notices available with redistributed binaries, and plan moderation before an open public event.
