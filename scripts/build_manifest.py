#!/usr/bin/env python3
"""Native input/output fingerprints used by builds and release preflight."""
from pathlib import Path
import argparse, hashlib, json
ROOT = Path(__file__).resolve().parents[1]

def digest(path): return hashlib.sha256(path.read_bytes()).hexdigest()
def inputs(root=ROOT):
    paths = []
    for folder in ('bridge', 'embedded'):
        paths += [p for p in (root/folder).rglob('*') if p.is_file() and (p.suffix in ('.cpp','.h','.hpp') or p.name in ('Makefile','SConstruct','build_profile.json'))]
    paths += [root/name for name in ('upstream.lock.json','dependencies.lock.json','scripts/install_bridge.py','scripts/host_audio_cursor.py','scripts/build_embedded_windows.sh','scripts/bootstrap_windows.sh')]
    return {p.relative_to(root).as_posix():hashlib.sha256(p.read_bytes().replace(b'\r\n',b'\n')).hexdigest() for p in sorted(paths)}
def write_manifest(build):
    outputs = ['Cardinal3DEngine.dll', 'rack/bin/Cardinal3DEngine.dll', 'rack/bin/Cardinal3DExtension.dll']
    manifest = {'inputs':inputs(), 'outputs':{name:digest(build/name) for name in outputs}}
    (build/'BUILD-MANIFEST.json').write_text(json.dumps(manifest,indent=2)+'\n')
def verify_build(build, root=ROOT):
    manifest=json.loads((build/'BUILD-MANIFEST.json').read_text())
    if manifest['inputs']!=inputs(root): raise RuntimeError('Native build does not match current source inputs; rebuild first')
    required={'Cardinal3DEngine.dll','rack/bin/Cardinal3DEngine.dll','rack/bin/Cardinal3DExtension.dll'}
    if set(manifest.get('outputs',{}))!=required: raise RuntimeError('Incomplete native output manifest')
    for name, expected in manifest['outputs'].items():
        if digest(build/name)!=expected: raise RuntimeError('Native output changed: '+name)
    return manifest
if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('build',type=Path);args=parser.parse_args();write_manifest(args.build)
