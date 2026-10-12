> Historical development reference. For Live v0.5, start with [the current manual](LIVE-MANUAL.md), [hosting](HOSTING.md) and [pipelines](PIPELINES.md).

# Starting a Cardinal 3D live show

Your Windows workspace now has two launch folders:

- **Cardinal 3D Show**: the current performer and internet show.
- **Cardinal 3D v0.77 Beta**: the preserved GitHub release, for playing without the Show features.

They keep separate saved patches and audio/layout settings. The v0.77 launchers use its fixed release build. The Show launchers use the current saved Show build. Neither launches a separate Cardinal application.

## Before each live show

1. **Network services:** keep the main PC and Umbrel powered on. Tailscale must be connected on both. Umbrel automatically starts **Tailscale**, **Cloudflare Tunnel** and **Portainer**; the welcome-page container also restarts automatically. Once the one-time [Umbrel welcome setup](UMBREL-WELCOME.md) is complete, the homepage stays online while the PC is off. You do not need to create a tunnel for each show.
2. In **Cardinal 3D Show**, open **1 - Start live show server.bat**. Leave its window open for the whole performance. If a server is already running, the launcher reuses it; keep the original server window open.
3. For VR, open **Meta Horizon Link**, connect and power on the Quest 2 by USB, and enter **Quest Link** inside the headset until the PC VR view appears.
4. Open **2 - Performer Quest.bat**. For a desktop performance instead, use **2 - Performer Desktop.bat**. Choose one performer, not both.
5. In the performer's **Audio & MIDI** menu, check the input/output devices, driver, channels, sample rate and buffer. Captured input is available from the **Audio 2 module's output sockets**. For spatial monitoring, connect your sounds to **Show Speaker** modules; the speaker-only monitoring option replaces the ordinary dry stereo output.
6. Open **Show & broadcast** from the main menu (**B** in VR). Confirm broadcasting is running; the Show launcher normally starts it automatically. Check your title, audio quality and speaker positions. Listen from a visitor page before inviting people.
7. Choose how guests enter:
   - **Private rehearsal:** leave **Public show** off and use **Copy visitor invitation**. Send that complete link to your guests.
   - **Public performance:** enable **Public show · anyone can enter from the homepage**, then share [live.example.org](https://live.example.org/). Once its bot is configured, Umbrel automatically posts the invitation to [@examplelive](https://t.me/examplelive). Private rehearsals never generate announcements.

The visitor chooses a name and appearance, enters the show, then clicks **Enable spatial sound**. The public site and performer must use the same running internet server. The old localhost:8778 preview is a separate test room and is not needed for a live show.

On phones/tablets, visitors walk using the faint bottom-left joystick and look by dragging the scene. **Chat & sound** opens audio/chat settings; mobile data saving starts enabled. In visitor VR, **B/Y** shows the movable HUD and **Grip + B/Y** recalls it. Hold its header with the trigger to reposition it, use the stick to adjust its distance, and release to place it. Sound activation, audio quality and a chat keyboard are available within this 3D panel.

## While performing

- Keep the Show server, performer, Tailscale and Umbrel's Cloudflare Tunnel running. Keep the PC awake.
- **B** opens the main menu. **Grip + B** opens the selected module's context menu. **A** opens the module browser.
- Add a **Show Chat Board** to your patch for shared chat. Point and click it to type using the virtual keyboard; your physical keyboard also works when the performer window has focus.
- Save your patch during the performance. Desktop and Quest launchers share the Show project's saved patch.
- You do not need Docker, a separate Cardinal program, a browser performer, Nginx Proxy Manager's interface, or the old web-preview launcher for this setup.

## Finishing

1. Stop broadcasting in **Show & broadcast**. Completed public performances appear in the landing page history; this logs the performance details, not an audio/video recording.
2. Wait about ten seconds for Umbrel to copy the updated public performance history. Save your patch and close the performer.
3. Close the Show server window when you no longer want to host the room. Umbrel's services can remain running.

## Where things are saved

Inside the Windows workspace:

| Item | Location |
| --- | --- |
| Show patches, recovery, audio and layout settings | `show-user` |
| v0.77 patches, recovery, audio and layout settings | `standalone-user` |
| Current and v0.77 frozen app builds | `runtime` |
| Show server session, hosting configuration and past performance history | `Cardinal-3D/.tools` |
| Always-on welcome-page snapshot and Telegram automation | Umbrel Docker volume `cardinal-show-welcome-data` |
| Landing page biography and manually scheduled shows | `Cardinal-3D/show-web/show-profile.json` |
| Previous test launchers and builds | `Archive` |

The source repository, build dependencies and the two saved user folders remain in their original locations so existing paths keep working. The two launch folders are the everyday entry points. Archived scripts are reference copies, not active launchers.
