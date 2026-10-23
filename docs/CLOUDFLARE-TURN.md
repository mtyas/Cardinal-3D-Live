# Cloudflare TURN setup for the 0.6 preview

This is a separate service from the Cloudflare HTTP tunnel. Both the PC relay
and visitors establish outbound connections, so SFR CGNAT does not require
router forwarding. The authoritative Cardinal engine remains on the host PC.
No Umbrel TURN container is required.

## Create the key

1. Sign in to the [Cloudflare dashboard](https://dash.cloudflare.com/?to=/:account/calls)
   and select the account used for the performance site.
2. Open Realtime / Calls and its TURN section. Create a TURN key named
   `Cardinal 3D Live 0.6`. If the dashboard asks to activate billing or accept
   service terms, review those before proceeding.
3. Retain the **TURN Key ID** and that key's **API token**. These are not a global
   Cloudflare API key, a tunnel token, or generated temporary ICE credentials.
   Never paste secrets into chat, screenshots or repository files.
4. Open **Set up Cloudflare TURN 0.6.bat** beside the existing launchers. Enter
   the ID and token into the local form; the token field is masked. Leave
   **Force TURN for the live test** checked and select **Verify and save**.

The form sends the token only to Cloudflare's fixed credential-generation API,
checks its response without publishing audio, backs up the private 0.6 hosting
configuration and stores the token under `.tools/live-0.6/`. These files are
Git-ignored, ordinary local files, not an encrypted credential vault. Existing
token files also receive private timestamped backups when replaced. Protect
these backups along with the active token; revoke the TURN key if exposed.

The generated hosting settings are:

```json
{
  "webrtc": {
    "enabled": true,
    "relay_only": true,
    "cloudflare_turn": {
      "key_id": "YOUR-TURN-KEY-ID",
      "api_token_file": "cloudflare-turn-api-token.txt",
      "ttl_seconds": 14400
    }
  }
}
```

Token paths resolve relative to the hosting JSON. The setup form preserves other
hosting settings and removes obsolete coturn shared-secret settings. The 0.5
hosting configuration and build are not edited.

## Restart and test

If verification fails, close the old form and reopen the setup BAT directly from
File Explorer so it loads the latest helper and runs with normal desktop network
access. The helper identifies itself as `Cardinal3DLive/0.6`: Cloudflare rejected
Python's default request identifier with HTTP 403 during diagnosis. HTTP errors
now show their status number without exposing credentials or response bodies.
401 indicates authentication failure; 404 indicates the key was not found; 403
can indicate authorization or request filtering. Network-access denial is
reported separately. Do not regenerate a key solely because of a network error.

Close the 0.6 performer and its launcher, then relaunch **Launch Cardinal 3D Live
0.6.bat**. A running relay does not reload the configuration automatically.
Reload the visitor room, choose Automatic/WebRTC audio and enable sound.

Use a phone on cellular data with Wi-Fi disabled and an invited performer on
another connection. Require **WebRTC · TURN relay**, sustained audible output,
moving mixer meters and responsive authorized controls. Check reconnect and
grant/revoke too. A successful API check proves credential issuance, not working
media. Record packet loss, mean jitter buffering and actual control-to-sound
delay. Network RTT is not the total playing latency.

For the existing automated native/browser acceptance harness, use only
`examples/show-mixer-stress.json` and set `CARDINAL_REQUIRE_TURN_RELAY=1` for
`show-web/check-rtc-browser.mjs`. This adds an assertion that a nominated media
candidate actually uses TURN; a local direct route cannot pass that assertion.
An additional separate-network physical-device test is still required.

After validation, `relay_only: false` allows direct routes where available and
TURN as fallback. The forced setting is useful during diagnosis. Force TURN
does not force a particular UDP/TCP URL; the browser chooses among offered
routes. The pinned Node peer currently selects the first supported TURN server,
normally Cloudflare's UDP endpoint; the browser also receives TCP/TLS alternatives.
Do not infer that every host-side firewall restriction is solved without testing.

## Credentials and failure behavior

Each negotiation requests fresh temporary credentials on the server with an
8-second API timeout. The returned ICE configuration contains only server URLs,
temporary username/password and the ICE transport policy. The master token, key
ID and file path are never included in the browser offer. Client input cannot
choose provider URLs or read token files. Disconnect aborts pending requests;
ordinary scene updates do not repeat the API request.

Credentials last four hours by default. Reconnect requests new credentials;
seamless credential refresh during longer connections is not implemented yet.
Choose a TTL up to 86400 seconds for longer rehearsals, then restart. Cloudflare
API failure reports `turn_credentials_failed` and leaves buffered audio available.
It does not log the API token or provider response. Automatic WebRTC retries
still apply, within the existing peer/request bounds.

Cloudflare currently lists 1,000 GB/month of shared Realtime SFU/TURN egress free,
then $0.05/GB. Verify the account's pricing and usage before larger events; a free
allowance is not a configured spending cap. No paid activation is performed by
the setup form.

To roll back, close 0.6, restore the timestamped private hosting backup (and its
matching token backup if replacing an older Cloudflare key), then restart. To
disable only Cloudflare, remove `cloudflare_turn` and set `relay_only: false`.
Key revocation is managed in Cloudflare. Keep the existing HTTP tunnel running.

References: [credential generation](https://developers.cloudflare.com/realtime/turn/generate-credentials/),
[pricing](https://developers.cloudflare.com/realtime/sfu/platform/pricing/).

## Personal deployment validation — 21 October 2026

The operator created the key and verified it using the local form. The saved
0.6 configuration forces TURN for the current test. No router forwarding or
Umbrel application changes were made.

The real native synthetic mixer fixture and real headless Chrome used public
HTTPS signaling and nominated **relay/relay** media candidates. A 100-second
browser observation contained 40 healthy playback samples after startup (about
80 seconds of decoded audio). At the last sample both tracks had 4,080 received
packets and one reported lost packet each; mean jitter buffering was about
86–88 ms and selected-pair RTT about 40 ms. Decoded waveform energy stayed
positive in healthy samples. Cumulative concealed samples were about 0.15–0.16%
of received samples. No browser exceptions were reported. Native assertions
confirmed 25 animated mixer meters and no Show source-ring overflow.

The first attempt to extend the test exceeded the existing fixture/harness time
limits; it was not counted as sustained acceptance. The successful rerun used
an explicit 110-second fixture hold and 180-second frontend timeout. Normal
frontend test timeout remains 60 seconds. Local evidence:
`reports/cloudflare-turn-first-playback.log` and
`reports/cloudflare-turn-sustained-playback.log` (not release artifacts).

The browser and host were on the same PC, but media was forced through external
Cloudflare TURN rather than a local/direct candidate. This confirms the relay
path through the home connection; it does not certify a remote collaborator's
network, phone/Mac playback, total musical latency or long-event reliability.
Physical separate-network acceptance remains required. The test session was
stopped so the normal launcher can start the user's own performance.
