#!/usr/bin/env python3
"""Prepare a separate local 0.6 preview from validated dependencies and engine."""
from pathlib import Path
import argparse,hashlib,json,shutil
ROOT=Path(__file__).resolve().parents[1]
def main():
 parser=argparse.ArgumentParser();parser.add_argument('--output',type=Path,default=ROOT/'dist/embedded-0.6');args=parser.parse_args()
 source=ROOT/'dist/embedded-full';target=args.output.resolve()
 engine=ROOT/'.tools/collaboration-native/Cardinal3DEngine.dll'
 for required in [engine,source/'rack/bin/Cardinal3DExtension.dll',source/'Cardinal/resources/PluginManifests/Cardinal.json']:
  if not required.is_file():raise RuntimeError(f'Missing validated build input: {required}')
 if target.exists():raise RuntimeError('0.6 preview already exists; prepare a new reviewed build before replacing it')
 target.mkdir(parents=True)
 shutil.copytree(source/'Cardinal',target/'Cardinal')
 shutil.copytree(ROOT/'godot',target/'rack',ignore=shutil.ignore_patterns('.godot','*.vcv','*.autosave','*.log'))
 shutil.copytree(source/'rack/bin',target/'rack/bin',dirs_exist_ok=True)
 shutil.copy2(engine,target/'rack/bin/Cardinal3DEngine.dll')
 shutil.copy2(source/'rack/cardinal_embedded.gdextension',target/'rack/cardinal_embedded.gdextension')
 shutil.copytree(source/'Notices',target/'Notices')
 manifest={'version':'0.6-alpha','purpose':'Local collaboration preview, not a release package','engine_sha256':hashlib.sha256(engine.read_bytes()).hexdigest(),'baseline_engine_sha256':hashlib.sha256((source/'rack/bin/Cardinal3DEngine.dll').read_bytes()).hexdigest(),'frontend_sha256':{str(p.relative_to(target/'rack')):hashlib.sha256(p.read_bytes()).hexdigest() for p in (target/'rack').rglob('*') if p.is_file() and p.suffix in ['.gd','.tscn','.godot']}}
 (target/'PREVIEW-MANIFEST.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
 print('Prepared separate preview:',target)
if __name__=='__main__':main()
