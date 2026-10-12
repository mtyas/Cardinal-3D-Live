> Historical development reference. For Live v0.5, start with [the current manual](LIVE-MANUAL.md), [hosting](HOSTING.md) and [pipelines](PIPELINES.md).

# Always-on welcome page and Telegram announcements

The welcome page runs on Umbrel, independently of the performance PC. It keeps the biography, upcoming dates and latest past-show list available between performances. During a show it forwards room assets and visitor audio/visual connections to the Windows Show server. Audio encoding and the synthesizer stay on Windows.

## One-time installation

1. Open Portainer on Umbrel (`http://192.168.1.10:9000`). Create a personal access token under **My account → Access tokens**. Save it in the private local file `Cardinal-3D/.tools/umbrel-portainer-api-key.txt`. Do not commit or share that file.
2. From the repository directory, run:

   ```powershell
   python scripts/umbrel_portal_admin.py inspect --api-key-file .tools/umbrel-portainer-api-key.txt
   python scripts/umbrel_portal_admin.py deploy --api-key-file .tools/umbrel-portainer-api-key.txt
   python scripts/umbrel_portal_admin.py status --api-key-file .tools/umbrel-portainer-api-key.txt
   ```

   If Portainer has several environments, use `--endpoint` with the appropriate environment ID. Installation refuses to replace an existing welcome container. It does not change other containers or apps.
3. Check `http://192.168.1.10:8788/`. The welcome container is named `cardinal-show-welcome`, with restart policy `unless-stopped`. Durable state is in the `cardinal-show-welcome-data` Docker volume. Umbrel's Portainer app must remain installed and running.
4. In Cloudflare Tunnel, change the existing public hostname **live.example.org** to service type **HTTP** and URL **192.168.1.10:8788**. The old destination `100.64.0.20:8878` points directly to the PC; keeping it would make the homepage disappear when the PC is off.
5. Keep Umbrel, Tailscale and Cloudflare Tunnel running. Their existing Umbrel startup settings are enabled. The welcome service forwards live traffic to `http://100.64.0.20:8878` over Tailscale. The PC's existing Umbrel-only access restriction is retained.

Portainer runs custom containers in its own Docker environment. This service needs no extra app folders mounted and does not restart the Portainer app. The deployment copies the welcome assets into the new container and keeps its state in a named volume.

When welcome-page code changes later, use `python scripts/umbrel_portal_admin.py update --api-key-file .tools/umbrel-portainer-api-key.txt`. This updates and restarts only the welcome container, retaining its snapshot, Telegram configuration and announcement history.

## Telegram setup

Visitors follow [@examplelive](https://t.me/examplelive) using **Let me know** on the welcome page. No email addresses are collected.

1. In Telegram, create a bot using **@BotFather → /newbot**.
2. Add the bot as an administrator of **@examplelive**, with permission to **post messages**.
3. In the private local file `Cardinal-3D/.tools/show-telegram.json`, keep `channel` as `@examplelive` and set `botToken` to the token from BotFather. Save the file without sharing it.
4. Run:

   ```powershell
   python scripts/umbrel_portal_admin.py configure-telegram --api-key-file .tools/umbrel-portainer-api-key.txt --telegram-file .tools/show-telegram.json
   ```

The setup checks the bot's channel posting permission without sending a public test message. It stores the configuration privately in the Umbrel data volume. The service reloads it automatically; no restart is required.

When a **public** show begins, Umbrel posts the title and `https://live.example.org/` to the channel. Private rehearsals never post. A stable public performance ID prevents duplicate posts during normal polling and welcome-service restarts. Confirmed Telegram rate limits are retried after their delay. Ambiguous delivery failures are saved for review and are not automatically repeated, to avoid duplicate announcements.

The service polls live status every five seconds. Past-show information is copied only when it changes. Secrets and Telegram delivery state are never exposed by the public API. Announcement delivery state is stored in `announcements.json` in the private Umbrel volume.

## Each performance

Umbrel's welcome service stays running all the time. On the PC, start **1 - Start live show server.bat**, connect Quest Link and start the performer. In **Show & broadcast**, start broadcasting and enable **Public show** when ready for the audience. That public transition creates the performance record and triggers its announcement.

At the end, stop broadcasting, wait about ten seconds for the welcome service to copy the completed performance list, then close the performer and PC server. The homepage stays online and displays **Between performances**.
