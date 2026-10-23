#!/usr/bin/env python3
"""Download pinned preferred sources for the WebRTC server into release downloads."""
from pathlib import Path
import argparse, hashlib, json, urllib.request

ROOT = Path(__file__).resolve().parents[1]

def fetch(output):
    output.mkdir(parents=True, exist_ok=True)
    pins = json.loads((ROOT / 'dependencies.lock.json').read_text(encoding='utf-8'))
    results = {}
    for pin in pins['webrtc_sources']:
        owner, name = pin['repository'].removeprefix('https://github.com/').split('/')
        path = output / (pin['package'] + '-' + pin['commit'] + '.tar.gz')
        if not path.exists():
            request = urllib.request.Request('https://codeload.github.com/' + owner + '/' + name + '/tar.gz/' + pin['commit'], headers={'User-Agent':'Cardinal-3D-Live source packaging'})
            with urllib.request.urlopen(request, timeout=90) as response:
                data = response.read()
            if hashlib.sha256(data).hexdigest() != pin['archive_sha256']:
                raise RuntimeError('Source archive hash mismatch: '+pin['package'])
            path.write_bytes(data)
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        if digest != pin['archive_sha256']:
            raise RuntimeError('Cached source archive hash mismatch: '+str(path))
        results[path.name] = digest
    print(json.dumps(results, indent=2))

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True, help='Same downloads folder passed to package_release_sources.py')
    fetch(parser.parse_args().output)
