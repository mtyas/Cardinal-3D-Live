#!/usr/bin/env python3
"""Local, masked TURN setup form; no credentials pass through chat or argv."""
import json
import os
from pathlib import Path
import queue
import re
import socket
import ssl
import threading
import time
import tkinter as tk
from tkinter import messagebox, ttk
import urllib.request
import urllib.error

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / '.tools/live-0.6'


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ValueError('Unexpected redirect')


def verify(key_id, token):
    if not re.fullmatch(r'[a-zA-Z0-9_-]{8,128}', key_id):
        raise ValueError('Enter the TURN Key ID shown by Cloudflare.')
    if not token or len(token) > 4096 or '\n' in token or '\r' in token:
        raise ValueError('Enter the TURN key API token, not a temporary ICE password.')
    request = urllib.request.Request(
        f'https://rtc.live.cloudflare.com/v1/turn/keys/{key_id}/credentials/generate-ice-servers',
        data=json.dumps({'ttl': 14400}).encode(), method='POST',
        headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json',
                 'User-Agent': 'Cardinal3DLive/0.6', 'Accept': 'application/json'})
    try:
        with urllib.request.build_opener(NoRedirect).open(request, timeout=12) as response:
            body = response.read(65537)
        if len(body) > 65536:
            raise ValueError()
        servers = json.loads(body)['iceServers']
        if not any(s.get('username') and s.get('credential') and any(
                u.startswith(('turn:turn.cloudflare.com:', 'turns:turn.cloudflare.com:'))
                for u in ([s['urls']] if isinstance(s.get('urls'), str) else s.get('urls', []))) for s in servers):
            raise ValueError()
    except urllib.error.HTTPError as error:
        # Never display HTTP bodies, tokens or request URLs in error dialogs.
        code = error.code
        error.close()
        if code == 401:
            detail = 'The API token was not accepted. Copy the token belonging to this TURN key.'
        elif code == 403:
            detail = 'Access was refused. Check the TURN token; a network or request filter may also be blocking access.'
        elif code == 404:
            detail = 'The TURN key was not found. Check the Key ID and that its matching API token was copied.'
        elif code == 429:
            detail = 'Too many requests. Wait a minute before retrying.'
        elif code >= 500:
            detail = 'The Cloudflare service is temporarily unavailable. Retry shortly.'
        else:
            detail = 'Cloudflare rejected the credential request. Check the TURN Key ID and API token.'
        raise ValueError(f'Cloudflare HTTP {code}: {detail}') from None
    except urllib.error.URLError as error:
        if isinstance(error.reason, PermissionError):
            detail = 'This setup process is blocked from accessing the network. Close it and open Set up Cloudflare TURN 0.6.bat directly from File Explorer.'
        elif isinstance(error.reason, ssl.SSLError):
            detail = 'Could not verify the HTTPS connection to Cloudflare. Check the PC clock and certificate/proxy settings.'
        else:
            detail = 'Could not connect to Cloudflare. Check internet access, DNS and any proxy or firewall.'
        raise ValueError(detail) from None
    except (TimeoutError, socket.timeout):
        raise ValueError('Cloudflare did not respond in time. Retry shortly.') from None
    except Exception:
        raise ValueError('Cloudflare returned an unexpected response instead of valid temporary TURN credentials.') from None


def save(key_id, token, force_relay):
    path = DATA / 'hosting.json'
    settings = json.loads(path.read_text(encoding='utf-8-sig'))
    stamp = time.time_ns()
    (DATA / f'hosting-before-cloudflare-{stamp}.json').write_bytes(path.read_bytes())
    token_path = DATA / 'cloudflare-turn-api-token.txt'
    if token_path.exists():
        (DATA / f'cloudflare-turn-api-token-before-{stamp}.txt').write_bytes(token_path.read_bytes())
    # Write atomically and never put the secret into the hosting JSON or logs.
    temp_token = DATA / 'cloudflare-turn-api-token.tmp'
    with open(temp_token, 'w', encoding='utf-8') as output:
        os.chmod(temp_token, 0o600)
        output.write(token)
    temp_token.replace(token_path)
    rtc = settings.setdefault('webrtc', {})
    rtc.update(enabled=True, relay_only=force_relay, cloudflare_turn={
        'key_id': key_id, 'api_token_file': token_path.name, 'ttl_seconds': 14400})
    # Cloudflare is the selected TURN provider; remove obsolete coturn settings.
    rtc.pop('turn_secret', None)
    rtc.pop('turn_urls', None)
    temp_config = DATA / 'hosting-cloudflare.tmp'
    temp_config.write_text(json.dumps(settings, indent=2) + '\n', encoding='utf-8')
    temp_config.replace(path)


def main():
    app = tk.Tk()
    app.title('Cardinal 3D Live 0.6 — Cloudflare TURN')
    app.resizable(False, False)
    frame = ttk.Frame(app, padding=20)
    frame.grid()
    ttk.Label(frame, text='Paste the TURN Key ID and its API token from Cloudflare.\n'
              'The token stays in a private, Git-ignored file on this PC.\n'
              'Saving checks the key with Cloudflare; no audio is uploaded.').grid(column=0, row=0, columnspan=2, sticky='w', pady=(0, 15))
    ttk.Label(frame, text='TURN Key ID').grid(column=0, row=1, sticky='w')
    key = ttk.Entry(frame, width=54)
    key.grid(column=1, row=1, pady=5)
    ttk.Label(frame, text='TURN API token').grid(column=0, row=2, sticky='w', padx=(0, 15))
    secret = ttk.Entry(frame, width=54, show='*')
    secret.grid(column=1, row=2, pady=5)
    force = tk.BooleanVar(value=True)
    ttk.Checkbutton(frame, text='Force TURN for the live test (proves the relay works)', variable=force).grid(column=0, row=3, columnspan=2, sticky='w', pady=10)
    status = tk.StringVar(value='Your 0.5 backup is not changed.')
    ttk.Label(frame, textvariable=status, wraplength=510).grid(column=0, row=5, columnspan=2, sticky='w', pady=(12, 0))
    results = queue.Queue()

    def submit():
        key_id, token, relay = key.get().strip(), secret.get().strip(), force.get()
        button.config(state='disabled')
        status.set('Verifying the TURN key with Cloudflare…')

        def work():
            try:
                verify(key_id, token)
                save(key_id, token, relay)
                results.put(None)
            except ValueError as error:
                results.put(str(error))
            except Exception:
                results.put('Could not save the private 0.6 configuration. Check that the live setup exists and its files are writable.')

        threading.Thread(target=work, daemon=True).start()

    def poll():
        try:
            error = results.get_nowait()
        except queue.Empty:
            app.after(100, poll)
            return
        button.config(state='normal')
        if error:
            status.set(error)
        else:
            secret.delete(0, tk.END)
            status.set('Saved and verified. Close 0.6 and its launcher, then launch 0.6 again. '
                       'Reload the visitor page and enable sound. Expect “WebRTC · TURN relay”.')
            messagebox.showinfo('TURN key verified', 'Cloudflare issued temporary credentials successfully.\n\n'
                               'Restart the 0.6 launcher, then reload the visitor page.\n'
                               'Live audio connectivity still needs testing.', parent=app)
        app.after(100, poll)

    button = ttk.Button(frame, text='Verify and save for 0.6', command=submit)
    button.grid(column=0, row=4, columnspan=2, sticky='e')
    app.after(100, poll)
    app.mainloop()


if __name__ == '__main__':
    main()
