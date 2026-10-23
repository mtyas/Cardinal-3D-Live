#!/usr/bin/env python3
"""Run a real Godot publisher and independent listener against an isolated relay."""
import argparse, json, os, shutil, socket, subprocess, sys, tempfile, time
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]

def main():
 p=argparse.ArgumentParser();p.add_argument('--godot',type=Path,required=True);p.add_argument('--node',default='node');p.add_argument('--build',type=Path,default=ROOT/'dist/embedded-full');p.add_argument('--controls',action='store_true');p.add_argument('--opus',action='store_true');p.add_argument('--visual-stage',action='store_true');p.add_argument('--engine',type=Path);args=p.parse_args()
 with tempfile.TemporaryDirectory(prefix='cardinal-live-check-') as folder:
  scratch=Path(folder);project=scratch/'project';session=scratch/'session.json'
  shutil.copytree(ROOT/'godot',project,ignore=shutil.ignore_patterns('.godot'))
  shutil.copytree(args.build/'rack/bin',project/'bin',dirs_exist_ok=True)
  if args.engine:shutil.copy2(args.engine,project/'bin/Cardinal3DEngine.dll')
  shutil.copy2(args.build/'rack/cardinal_embedded.gdextension',project/'cardinal_embedded.gdextension')
  with socket.socket() as reservation:reservation.bind(('127.0.0.1',0));port=reservation.getsockname()[1]
  env=os.environ.copy()
  for key in list(env):
   if key.startswith('CARDINAL_'):env.pop(key)
  env.update(CARDINAL_SHOW_PORT=str(port),CARDINAL_SHOW_SESSION_PATH=str(session),CARDINAL_SHOW_SESSION=str(session),CARDINAL_3D_EMBEDDED='1',CARDINAL_3D_XR='0',CARDINAL_SHOW_AUTO_START='1',CARDINAL_EMBEDDED_RESOURCES=str((args.build/'Cardinal').resolve()),CARDINAL_EMBEDDED_PATCH=str(ROOT/('examples/show-visual-stage.json' if args.visual_stage else 'examples/show-starter.json')))
  if args.controls:env['CARDINAL_CONTROL_TEST_SESSION']=str(session)
  server_log=open(scratch/'server.log','w')
  server=subprocess.Popen([args.node,'server.mjs'],cwd=ROOT/'show-web',env=env,stdout=server_log,stderr=subprocess.STDOUT)
  listener=None
  try:
   for _ in range(200):
    if session.exists():break
    if server.poll() is not None:raise RuntimeError('Relay exited')
    time.sleep(.025)
   if not session.exists():raise RuntimeError('Relay startup timed out')
   listener=subprocess.Popen([args.node,'check-control-client.mjs' if args.controls else 'check-opus-publisher.mjs' if args.opus else 'check-live-publisher.mjs',f'ws://127.0.0.1:{port}/room','25000'],cwd=ROOT/'show-web',env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True)
   frontend=subprocess.run([sys.executable,ROOT/'scripts/check_frontend.py',args.godot.resolve(),ROOT/('tests/control_native.gd' if args.controls else 'tests/show_publish.gd'),'--project',project,'--graphics','--integration'],env=env,capture_output=True,text=True,encoding='utf-8',errors='replace',timeout=90)
   output,_=listener.communicate(timeout=35)
   (ROOT/'reports').mkdir(exist_ok=True);(ROOT/('reports/live-controls.log' if args.controls else 'reports/live-publisher.log')).write_text(frontend.stdout+frontend.stderr+output,encoding='utf-8')
   if frontend.returncode or listener.returncode:raise RuntimeError(frontend.stdout+frontend.stderr+output)
   for line in (frontend.stdout+output).splitlines():
    if 'PASS' in line:print(line)
  finally:
   if listener and listener.poll() is None:listener.kill();listener.wait()
   server.terminate();server.wait(timeout=10);server_log.close()
if __name__=='__main__':main()
