#!/usr/bin/env python3
"""Run one version's live relay and native host, retaining the other as backup."""
import argparse,json,os,shutil,subprocess,sys,time,urllib.request
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def main():
 p=argparse.ArgumentParser();p.add_argument('--version',choices=['0.5','0.6'],default='0.6');p.add_argument('--vr',action='store_true');p.add_argument('--relay-only',action='store_true');p.add_argument('--dry-run',action='store_true');a=p.parse_args()
 data=ROOT/'.tools'/('live-'+a.version);config=data/'hosting.json';session=data/'session.json'
 build=ROOT/'dist'/('embedded-0.6' if a.version=='0.6' else 'embedded-full')
 pointer=data/'runtime.json'
 if a.version=='0.6' and pointer.is_file():build=Path(json.loads(pointer.read_text(encoding='utf-8'))['runtime']).resolve()
 web=ROOT/'show-web' if a.version=='0.6' else ROOT.parent/'Cardinal-3D/show-web'
 godot=ROOT/'.tools/Godot/Godot_v4.5.1-stable_win64.exe'
 user=ROOT/'.tools'/('collaboration-user-0.6' if a.version=='0.6' else 'foundation-test-user')
 node=shutil.which('node')
 if not node or not config.is_file() or not (web/'node_modules/ws/package.json').is_file():raise RuntimeError('Live setup is incomplete: Node, relay dependencies and private hosting.json are required')
 settings=json.loads(config.read_text(encoding='utf-8-sig'));port=int(settings['port']);origin=settings['public_origin']
 command=[sys.executable,str(ROOT/'scripts/run_embedded_windows.py'),'--show','--build',str(build),'--godot',str(godot),'--user-directory',str(user)]
 if a.version=='0.6':command+=['--manual-live']
 if a.vr:command+=['--vr']
 if a.dry_run:return subprocess.call(command+['--dry-run'])
 data.mkdir(parents=True,exist_ok=True)
 env=os.environ.copy()
 for key in list(env):
  if key.startswith('CARDINAL_SHOW_'):env.pop(key)
 env.update(CARDINAL_SHOW_HOSTING_CONFIG=str(config),CARDINAL_SHOW_PORT=str(port),CARDINAL_SHOW_SESSION_PATH=str(session))
 health=None
 try:
  with urllib.request.urlopen(f'http://127.0.0.1:{port}/health',timeout=2) as response:health=json.load(response)
 except OSError:pass
 server=None;log=None;job=None
 try:
  if health:
   expected=health.get('version','0.5')
   if health.get('app')!='cardinal-3d-show-preview' or not expected.startswith(a.version) or not session.is_file():raise RuntimeError('The live port is used by another session. Close the other version and its launcher before switching.')
   if health.get('nativeConnected') and not a.relay_only:raise RuntimeError('A performer is already connected. Close that performer before launching another.')
  else:
   log=open(data/'relay.log','w',encoding='utf-8')
   server=subprocess.Popen([node,'server.mjs'],cwd=web,env=env,stdout=log,stderr=subprocess.STDOUT,creationflags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0)
   if os.name=='nt':
    from windows_child_job import ChildJob
    job=ChildJob(server)
   for _ in range(150):
    if server.poll() is not None:raise RuntimeError('Relay failed; see '+str(data/'relay.log'))
    try:
     with urllib.request.urlopen(f'http://127.0.0.1:{port}/health',timeout=.3) as response:health=json.load(response)
     if session.is_file():break
    except OSError:pass
    time.sleep(.1)
   else:raise RuntimeError('Relay startup timed out')
  print(f'Cardinal 3D Live {a.version}: {origin}',flush=True)
  print('Use Live to name and start your session, then Settings > Session > Copy invitation.' if a.version=='0.6' else 'Invitation-only rehearsal. Use Show > Copy visitor invitation link.',flush=True)
  print('In Settings > Session, allow invited performers to play, select a visitor and choose Invite to play.' if a.version=='0.6' else '0.5 backup: visitors remain read-only.',flush=True)
  print('Close this performer and launcher before switching versions. Your other build and settings remain separate.',flush=True)
  # Preserve the original 0.5 launcher's expected connection file for this 0.5 relay.
  if a.version=='0.5':shutil.copy2(session,ROOT.parent/'Cardinal-3D/.tools/show-room-session.json')
  if a.relay_only:
   print('Relay ready; Ctrl+C stops this relay.',flush=True)
   while server is None or server.poll() is None:time.sleep(.5)
   return server.returncode
  return subprocess.call(command+['--session',str(session)])
 finally:
  if server and server.poll() is None:
   server.terminate()
   try:server.wait(timeout=10)
   except subprocess.TimeoutExpired:server.kill();server.wait()
  if job:job.close()
  if log:log.close()
if __name__=='__main__':
 try:sys.exit(main())
 except KeyboardInterrupt:sys.exit(0)
 except Exception as error:print('Cannot launch: '+str(error),file=sys.stderr);sys.exit(1)
