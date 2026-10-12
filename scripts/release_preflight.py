"""Fail release preparation before copying files when provenance is incomplete."""
from pathlib import Path
import json, subprocess, tarfile
from build_manifest import verify_build

def git(root, *args):
    return subprocess.check_output(['git','-c','safe.directory='+str(root.resolve()),'-C',str(root),*args],text=True).strip()
def require_clean(root):
    if git(root,'status','--porcelain'): raise RuntimeError('Commit or remove working-tree changes before producing a release')
    return git(root,'rev-parse','HEAD')
def verify_source_archive(path, commit, pins):
    with tarfile.open(path) as archive:
        manifests=[m for m in archive if m.name.endswith('/SOURCE_MANIFEST.json')]
        if len(manifests)!=1: raise RuntimeError('Expected one source manifest')
        manifest=json.load(archive.extractfile(manifests[0]))
    expected={'vendor/Cardinal/':pins['cardinal'],'.tools/godot-cpp/':pins['bindings'],
              'browser-decoder':pins['decoder'],'server-codec':pins['codec']}
    if manifest.get('project_commit')!=commit: raise RuntimeError('Binary and source archive commits differ')
    for name, revision in expected.items():
        if manifest.get('repositories',{}).get(name,{}).get('commit')!=revision:
            raise RuntimeError('Source archive missing or mismatched dependency: '+name)
    return manifest

def preflight(root, build, godot, node, source_archive):
    commit=require_clean(root)
    upstream=json.loads((root/'upstream.lock.json').read_text());deps=json.loads((root/'dependencies.lock.json').read_text())
    verify_build(build,root)
    node_version=subprocess.check_output([str(node.resolve()),'--version'],text=True).strip().removeprefix('v')
    if node_version!=deps['node']: raise RuntimeError('Node version mismatch: '+node_version)
    version=subprocess.check_output([str(godot.resolve()),'--version'],text=True).strip()
    if not version.startswith(upstream['godot'].replace('-stable','.stable')): raise RuntimeError('Godot version mismatch: '+version)
    verify_source_archive(source_archive,commit,{'cardinal':upstream['commit'],'bindings':deps['godot_bindings'],
        'decoder':deps['browser_decoder']['commit'],'codec':deps['server_codec']['commit']})
    lock=json.loads((root/'show-web/package-lock.json').read_text())
    for name, expected in lock['packages'].items():
        if not name or expected.get('optional'): continue
        path=root/'show-web'/name/'package.json'
        if not path.is_file() or json.loads(path.read_text()).get('version')!=expected['version']:
            raise RuntimeError('Missing or mismatched web dependency: '+name+'; run npm ci --ignore-scripts')
    for name in ('legal/NOTICE.txt','legal/LICENSES.md','legal/LICENSE-PERMISSIONS.md','legal/Godot-COPYRIGHT.txt','show-web/THIRD-PARTY-LICENSES.txt'):
        if not (root/name).is_file(): raise RuntimeError('Missing notice: '+name)
    subprocess.run([str(node.resolve()),'--input-type=module','-e',"import('esbuild').then(m=>m.transformSync('let check=1'))"],cwd=root/'show-web',check=True,capture_output=True)
    return commit
