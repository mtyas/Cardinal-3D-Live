#!/usr/bin/env python3
"""Build a clean portable Live release; never copy private user/config folders."""
from pathlib import Path
import argparse,hashlib,json,shutil,subprocess,zipfile

ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser()
parser.add_argument('--build',type=Path,required=True)
parser.add_argument('--godot',type=Path,required=True)
parser.add_argument('--node',type=Path,required=True)
parser.add_argument('--output',type=Path,default=ROOT/'dist/releases')
args=parser.parse_args()
version=(ROOT/'VERSION').read_text().strip()
folder=args.output/f'Cardinal-3D-Live-{version}-Windows-x64'
folder.mkdir(parents=True,exist_ok=False)
shutil.copytree(args.build/'Cardinal',folder/'Cardinal',ignore=shutil.ignore_patterns('.git','*.log'))
shutil.copytree(ROOT/'godot',folder/'rack',ignore=shutil.ignore_patterns('.godot','*.vcv','*.autosave','openxr_action_map.tres','*.log'))
shutil.copytree(args.build/'rack/bin',folder/'rack/bin',dirs_exist_ok=True)
shutil.copy2(args.build/'rack/cardinal_embedded.gdextension',folder/'rack/cardinal_embedded.gdextension')
shutil.copytree(ROOT/'show-web',folder/'show-web',ignore=shutil.ignore_patterns('*.test.mjs','*.log','*.map'))
if not (folder/'show-web/node_modules/opus-decoder/package.json').exists():raise RuntimeError('Run npm ci in show-web first')
shutil.copytree(ROOT/'legal',folder/'legal')
shutil.copytree(ROOT/'docs/images',folder/'docs/images')
for name in ('LIVE-MANUAL.md','PIPELINES.md','HOSTING.md','BUILD-LIVE.md','RELEASE-0.5.md'):
 shutil.copy2(ROOT/'docs'/name,folder/'docs'/name)
for name in ('README.md','LICENSE','upstream.lock.json','dependencies.lock.json'):
 shutil.copy2(ROOT/name,folder/name)
shutil.copytree(ROOT/'examples',folder/'examples')
shutil.copy2(args.godot,folder/'Cardinal-3D-Live.exe')
shutil.copy2(args.node,folder/'node.exe')
subprocess.run([str((folder/'Cardinal-3D-Live.exe').resolve()),'--headless','--audio-driver','Dummy','--path',str((folder/'rack').resolve()),'--editor','--quit-after','60','--frame-delay','100'],check=True,timeout=60,capture_output=True)
editor=(folder/'rack/.godot/editor').resolve()
if editor.is_relative_to(folder.resolve()) and editor.exists():shutil.rmtree(editor)
common=f'''@echo off
setlocal
cd /d "%~dp0"
set "CARDINAL_EMBEDDED_USER_DIR=%LOCALAPPDATA%\\Cardinal-3D-Live\\{version}"
if not exist "%CARDINAL_EMBEDDED_USER_DIR%" mkdir "%CARDINAL_EMBEDDED_USER_DIR%"
set "CARDINAL_SHOW_SESSION=%CARDINAL_EMBEDDED_USER_DIR%\\show-session.json"
'''
server=common+'''set "CARDINAL_SHOW_SESSION_PATH=%CARDINAL_SHOW_SESSION%"
set "CARDINAL_SHOW_PORT=8878"
if exist "%CARDINAL_EMBEDDED_USER_DIR%\\hosting.json" set "CARDINAL_SHOW_HOSTING_CONFIG=%CARDINAL_EMBEDDED_USER_DIR%\\hosting.json"
cd /d "%~dp0show-web"
"%~dp0node.exe" server.mjs
if errorlevel 1 pause
'''
(folder/'1 - Start Show server.bat').write_text(server,encoding='ascii',newline='\r\n')
for vr,name in [(False,'2 - Performer desktop.bat'),(True,'2 - Performer Quest.bat')]:
 launch=common+f'''set "CARDINAL_3D_EMBEDDED=1"
set "CARDINAL_3D_XR={int(vr)}"
set "CARDINAL_SHOW_AUTO_START=1"
set "CARDINAL_EMBEDDED_RESOURCES=%~dp0Cardinal"
set "CARDINAL_EMBEDDED_PATCH="
if not exist "%CARDINAL_EMBEDDED_USER_DIR%\\autosave.vcv" set "CARDINAL_EMBEDDED_PATCH=%~dp0examples\\show-starter.json"
'''
 if vr:
  launch+='''if exist "%ProgramFiles%\\Oculus\\Support\\oculus-runtime\\oculus_openxr_64.json" set "XR_RUNTIME_JSON=%ProgramFiles%\\Oculus\\Support\\oculus-runtime\\oculus_openxr_64.json"
if exist "%ProgramFiles%\\Meta Horizon\\Support\\oculus-runtime\\oculus_openxr_64.json" set "XR_RUNTIME_JSON=%ProgramFiles%\\Meta Horizon\\Support\\oculus-runtime\\oculus_openxr_64.json"
'''
 launch+=f'''"%~dp0Cardinal-3D-Live.exe" --path "%~dp0rack" --rendering-driver opengl3 --xr-mode {'on' if vr else 'off'} --log-file "%CARDINAL_EMBEDDED_USER_DIR%\\session.log"
if errorlevel 1 pause
'''
 (folder/name).write_text(launch,encoding='ascii',newline='\r\n')
manifest={'project':'Cardinal 3D Live','version':version,'source_commit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),
 'source_archive':f'Cardinal-3D-Live-{version}-source.tar.gz','node':subprocess.check_output([str(args.node),'--version'],text=True).strip(),'files_sha256':{}}
for file in sorted(folder.rglob('*')):
 if file.is_file():manifest['files_sha256'][file.relative_to(folder).as_posix()]=hashlib.sha256(file.read_bytes()).hexdigest()
(folder/'RELEASE-MANIFEST.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
archive_path=args.output/(folder.name+'.zip')
with zipfile.ZipFile(archive_path,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as archive:
 for file in sorted(folder.rglob('*')):
  if file.is_file():archive.write(file,file.relative_to(args.output))
print(json.dumps({'archive':str(archive_path),'bytes':archive_path.stat().st_size,'source_commit':manifest['source_commit']}))
