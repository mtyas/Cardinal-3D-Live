#!/usr/bin/env python3
"""Manage only the Cardinal landing container through the granted Portainer API.

Credentials are read from stdin and are never saved or printed.
"""
import argparse
import io
import getpass
import json
from pathlib import Path
import sys
import tarfile
import urllib.request
import urllib.parse
import urllib.error

ROOT = Path(__file__).resolve().parents[1]
NAME = 'cardinal-show-welcome'

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('action', choices=['inspect', 'deploy', 'update', 'status', 'configure-telegram'])
    parser.add_argument('--base', default='http://192.168.1.10:9000')
    parser.add_argument('--endpoint', type=int)
    parser.add_argument('--port', type=int, default=8788)
    parser.add_argument('--telegram-file', type=Path)
    parser.add_argument('--api-key-file', type=Path)
    args = parser.parse_args()
    if args.api_key_file:
        credentials = {'api_key': args.api_key_file.read_text(encoding='utf-8-sig').strip()}
        if not credentials['api_key']: raise RuntimeError('Save your Portainer access key in the private setup file first')
    else:
        credentials = json.loads(getpass.getpass('Private Portainer login: ') if sys.stdin.isatty() else sys.stdin.readline())
    token = None
    def api(path, method='GET', data=None, raw=None, mime='application/json', timeout=30):
        body = raw if raw is not None else json.dumps(data).encode() if data is not None else None
        headers = {'Content-Type': mime}
        if token: headers['Authorization'] = 'Bearer ' + token
        if credentials.get('api_key'): headers['X-API-Key'] = credentials['api_key']
        request = urllib.request.Request(args.base + path, data=body, headers=headers, method=method)
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                content = response.read()
                return json.loads(content) if content and mime == 'application/json' else content
        except urllib.error.HTTPError as error:
            try: message = json.loads(error.read()).get('message', 'Request rejected')
            except Exception: message = 'Request rejected'
            raise RuntimeError(f'Portainer returned {error.code}: {message}') from None
    if not credentials.get('api_key'):
        token = api('/api/auth', 'POST', {'Username': credentials['username'], 'Password': credentials['password']})['jwt']
    endpoints = api('/api/endpoints')
    if args.action == 'inspect':
        for endpoint in endpoints:
            eid = endpoint['Id']
            containers = api(f'/api/endpoints/{eid}/docker/containers/json?all=true')
            print(json.dumps({'endpoint': eid, 'name': endpoint['Name'], 'containers': [
                {'names': c['Names'], 'state': c['State'], 'ports': c.get('Ports', [])} for c in containers]}))
        return
    eid = args.endpoint or (endpoints[0]['Id'] if len(endpoints) == 1 else None)
    if not eid: raise RuntimeError('Choose the existing Docker environment explicitly')
    prefix = f'/api/endpoints/{eid}/docker'
    containers = api(prefix + '/containers/json?all=true')
    existing = next((c for c in containers if '/' + NAME in c['Names']), None)
    if args.action == 'status':
        if not existing: raise RuntimeError('Welcome container is not deployed')
        d = api(prefix + f'/containers/{existing["Id"]}/json')
        print(json.dumps({'name': NAME, 'state': d['State']['Status'], 'restart': d['HostConfig']['RestartPolicy'], 'ports': d['NetworkSettings']['Ports']}))
        return
    if args.action == 'configure-telegram':
        if not existing or not args.telegram_file: raise RuntimeError('Container and private Telegram configuration required')
        config = json.loads(args.telegram_file.read_text(encoding='utf-8-sig'))
        if not config.get('botToken') or not config.get('channel'): raise RuntimeError('Bot token and channel missing')
        if not config['channel'].startswith('@'): raise RuntimeError('Use the public channel @handle')
        # Check posting permission without sending a real announcement.
        def telegram(method, params=None):
            url = 'https://api.telegram.org/bot' + config['botToken'] + '/' + method
            request = urllib.request.Request(url, data=json.dumps(params or {}).encode(), headers={'Content-Type': 'application/json'})
            try:
                with urllib.request.urlopen(request, timeout=15) as response: result = json.loads(response.read())
            except Exception: raise RuntimeError('Could not verify Telegram bot access; check the token and channel') from None
            if not result.get('ok'): raise RuntimeError('Telegram rejected the bot configuration')
            return result['result']
        bot = telegram('getMe')
        member = telegram('getChatMember', {'chat_id': config['channel'], 'user_id': bot['id']})
        if member.get('status') not in ('creator', 'administrator') or (member.get('status') == 'administrator' and not member.get('can_post_messages')):
            raise RuntimeError('Add the bot as a channel administrator with permission to post messages')
        body = io.BytesIO()
        with tarfile.open(fileobj=body, mode='w') as archive:
            content = json.dumps(config).encode()
            entry = tarfile.TarInfo('telegram.json'); entry.size = len(content); entry.mode = 0o600
            archive.addfile(entry, io.BytesIO(content))
        api(prefix + f'/containers/{existing["Id"]}/archive?path=/data', 'PUT', raw=body.getvalue(), mime='application/x-tar')
        print('Telegram configuration stored privately on Umbrel; the service reloads it automatically.')
        return
    if args.action == 'update' and not existing: raise RuntimeError('Deploy the welcome container first')
    if args.action == 'deploy' and existing: raise RuntimeError('Container already exists; refusing to replace it or discard its state')
    if args.action == 'deploy':
        for c in containers:
            if any(p.get('PublicPort') == args.port for p in c.get('Ports', [])):
                raise RuntimeError('Requested welcome port is already in use')
        image = 'node:22-alpine'
    # Image pulls can take time. Only this image and this new container are affected.
        api(prefix + '/images/create?' + urllib.parse.urlencode({'fromImage': image}), 'POST', raw=b'', mime='text/plain', timeout=180)
        api(prefix + '/volumes/create', 'POST', {'Name': 'cardinal-show-welcome-data', 'Labels': {'app': NAME}})
        container = api(prefix + '/containers/create?name=' + NAME, 'POST', {
        'Image': image, 'Cmd': ['node', '/app/portal.mjs'], 'WorkingDir': '/app',
        'Env': ['PORT=8788', 'SHOW_UPSTREAM=http://100.64.0.20:8878',
                'PUBLIC_ORIGIN=https://live.example.org', 'DATA_DIR=/data'],
        'ExposedPorts': {'8788/tcp': {}}, 'Labels': {'app': NAME, 'org.cardinal.role': 'persistent-welcome'},
        'HostConfig': {'RestartPolicy': {'Name': 'unless-stopped'},
            'PortBindings': {'8788/tcp': [{'HostIp': '0.0.0.0', 'HostPort': str(args.port)}]},
            'Mounts': [{'Type': 'volume', 'Source': 'cardinal-show-welcome-data', 'Target': '/data'}],
            'Memory': 192 * 1024 * 1024, 'NanoCpus': 500000000, 'CapDrop': ['ALL'],
            'SecurityOpt': ['no-new-privileges:true'], 'LogConfig': {'Type': 'json-file', 'Config': {'max-size': '5m', 'max-file': '2'}}}})
        cid = container['Id']
    else:
        cid = existing['Id']
    body = io.BytesIO()
    with tarfile.open(fileobj=body, mode='w') as archive:
        for name in ('portal.mjs', 'telegram-announcer.mjs', 'index.html', 'landing.js', 'landing.css', 'show-profile.json'):
            content = (ROOT / 'show-web' / name).read_bytes()
            entry = tarfile.TarInfo('app/' + name); entry.size = len(content); entry.mode = 0o644
            archive.addfile(entry, io.BytesIO(content))
    api(prefix + f'/containers/{cid}/archive?path=/', 'PUT', raw=body.getvalue(), mime='application/x-tar')
    api(prefix + f'/containers/{cid}/' + ('restart?t=5' if args.action == 'update' else 'start'), 'POST', raw=b'')
    print(json.dumps({'action': args.action, 'container': NAME, 'port': args.port, 'restart': 'unless-stopped', 'dataVolume': 'cardinal-show-welcome-data'}))

if __name__ == '__main__':
    try: main()
    except Exception as error:
        # HTTP exceptions can contain request URLs; never print Telegram credentials.
        print('Portal setup failed: ' + str(error), file=sys.stderr)
        sys.exit(1)
