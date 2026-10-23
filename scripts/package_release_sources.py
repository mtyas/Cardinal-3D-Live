#!/usr/bin/env python3
"""Create a recursive matching source archive, not GitHub's incomplete gitlink ZIP."""
from pathlib import Path
import argparse, hashlib, io, json, os, subprocess, tarfile
from release_preflight import require_clean
root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--cardinal', type=Path, required=True)
parser.add_argument('--bindings', type=Path, required=True)
parser.add_argument('--downloads', type=Path, required=True)
parser.add_argument('--output', type=Path, required=True)
parser.add_argument('--decoder', type=Path, required=True, help='Exact recursive browser decoder source')
parser.add_argument('--opusscript', type=Path, required=True, help='Exact recursive server codec source')
args = parser.parse_args()
require_clean(root)
upstream=json.loads((root/'upstream.lock.json').read_text())
deps=json.loads((root/'dependencies.lock.json').read_text())
for pin in deps.get('webrtc_sources', []):
    path=args.downloads/(pin['package']+'-'+pin['commit']+'.tar.gz')
    if not path.is_file():raise RuntimeError('Missing WebRTC dependency sources. Run scripts/fetch_webrtc_sources.py --output '+str(args.downloads))
    if hashlib.sha256(path.read_bytes()).hexdigest()!=pin['archive_sha256']:raise RuntimeError('WebRTC source archive hash mismatch: '+str(path))
for directory,pin in [(args.cardinal,upstream['commit']),(args.bindings,deps['godot_bindings']),(args.decoder,deps['browser_decoder']['commit']),(args.opusscript,deps['server_codec']['commit'])]:
    actual=subprocess.check_output(['git','-c','safe.directory='+str(directory),'-C',str(directory),'rev-parse','HEAD'],text=True).strip()
    if actual!=pin: raise RuntimeError('Source pin mismatch: '+str(directory))
    status=subprocess.check_output(['git','-c','safe.directory='+str(directory),'-C',str(directory),'submodule','status','--recursive'],text=True)
    if any(not line.startswith(' ') for line in status.splitlines()): raise RuntimeError('Missing or mismatched recursive source: '+str(directory))
version = (root / 'VERSION').read_text().strip()
prefix = 'Cardinal-3D-Live-' + version + '-source'
def git(directory, *arguments):
    return subprocess.check_output(['git', '-c', 'safe.directory=' + str(directory), '-C', str(directory), *arguments])
def tracked(directory, recursive=True):
    files = set()
    repositories = [directory]
    for current, directories, filenames in os.walk(directory) if recursive else []:
        if Path(current) != directory and '.git' in filenames: repositories.append(Path(current))
        directories[:] = [d for d in directories if d not in ('.git', 'build', 'bin', 'node_modules')]
    for repository in repositories:
        for filename in git(repository, 'ls-files', '-z').decode().split('\0'):
            path = repository / filename
            if filename and path.is_file(): files.add(path)
    return sorted(files)
args.output.parent.mkdir(parents=True, exist_ok=True)
manifest = {'project_commit': git(root, 'rev-parse', 'HEAD').decode().strip(), 'version': version, 'repositories': {}, 'archives': {}}
with tarfile.open(args.output, 'w:gz', compresslevel=5, dereference=True) as archive:
    def metadata(name, content):
        data = content.encode(); info = tarfile.TarInfo(prefix + '/' + name); info.size = len(data); info.mode = 0o644
        archive.addfile(info, io.BytesIO(data))
    for directory, destination in [(root, ''), (args.cardinal, 'vendor/Cardinal/'), (args.bindings, '.tools/godot-cpp/')]:
        hashes = {}
        for path in tracked(directory, recursive=directory != root):
            relative = path.relative_to(directory).as_posix()
            if directory == root and relative.startswith(('setup/', 'vendor/')): continue
            archive.add(path, arcname=prefix + '/' + destination + relative, recursive=False)
            hashes[relative] = hashlib.sha256(path.read_bytes()).hexdigest()
        commit = git(directory, 'rev-parse', 'HEAD').decode().strip()
        manifest['repositories'][destination or 'project'] = {'commit': commit, 'files': len(hashes)}
        if directory == args.cardinal:
            metadata(destination + '.source-snapshot.json', json.dumps({'commit': commit, 'sha256': hashes}))
            metadata(destination + '.source-original-plugins-Makefile', git(directory, 'show', 'HEAD:plugins/Makefile').decode())
        if directory == args.bindings: metadata(destination + '.source-pin', commit + '\n')
    # Match the direct Windows ASIO backend with its complete GPL SDK source.
    asio = root / '.tools/asio-sdk'
    if (root / 'embedded/DeviceAudio.cpp').exists():
        if not (asio / 'ASIOSDK/common/asio.h').is_file():
            raise RuntimeError('Fetch the pinned GPL ASIO SDK before packaging matching sources')
        for path in sorted(asio.rglob('*')):
            if path.is_file(): archive.add(path, arcname=prefix + '/.tools/asio-sdk/' + path.relative_to(asio).as_posix(), recursive=False)
    for path in sorted(args.downloads.iterdir()):
        if path.is_file():
            archive.add(path, arcname=prefix + '/dependency-sources/' + path.name, recursive=False)
            manifest['archives'][path.name] = hashlib.sha256(path.read_bytes()).hexdigest()
    if args.decoder:
        pin=json.loads((root/'dependencies.lock.json').read_text())['browser_decoder']['commit']
        actual=git(args.decoder,'rev-parse','HEAD').decode().strip()
        if actual!=pin: raise RuntimeError('Browser decoder source pin mismatch')
        for path in tracked(args.decoder):
            archive.add(path,arcname=prefix+'/dependency-sources/wasm-audio-decoders/'+path.relative_to(args.decoder).as_posix(),recursive=False)
        manifest['repositories']['browser-decoder']={'commit':actual}
    if args.opusscript:
        pin=json.loads((root/'dependencies.lock.json').read_text())['server_codec']['commit']
        actual=git(args.opusscript,'rev-parse','HEAD').decode().strip()
        if actual!=pin: raise RuntimeError('Server codec source pin mismatch')
        for path in tracked(args.opusscript):
            archive.add(path,arcname=prefix+'/dependency-sources/opusscript/'+path.relative_to(args.opusscript).as_posix(),recursive=False)
        manifest['repositories']['server-codec']={'commit':actual}
    metadata('SOURCE_MANIFEST.json', json.dumps(manifest, indent=2) + '\n')
print(json.dumps({'source_archive': str(args.output), 'bytes': args.output.stat().st_size, **manifest['repositories']}))
