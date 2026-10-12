#!/usr/bin/env python3
"""Launch the isolated Windows/Quest embedded host; never spawn Cardinal.exe."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]

def meta_runtime():
    candidates = [Path(os.environ.get('ProgramFiles', 'C:/Program Files')) / name /
        'Support/oculus-runtime/oculus_openxr_64.json' for name in ('Meta Horizon', 'Oculus')]
    try:
        import winreg
        with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r'SOFTWARE\Oculus VR, LLC\Oculus') as key:
            candidates.insert(0, Path(winreg.QueryValueEx(key, 'Base')[0]) / 'Support/oculus-runtime/oculus_openxr_64.json')
    except OSError: pass
    runtime = next((path for path in candidates if path.is_file()), None)
    if runtime is None: raise RuntimeError('Meta Horizon Link runtime not found')
    return runtime

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--vr', action='store_true')
    parser.add_argument('--show', action='store_true', help='Use the separate Show test runtime, settings and starter')
    parser.add_argument('--session', type=Path, help='Connection file written by the running Show relay')
    parser.add_argument('--build', type=Path, help='Explicit development build; otherwise use the saved launch copy')
    parser.add_argument('--godot', type=Path)
    parser.add_argument('--patch', type=Path)
    parser.add_argument('--user-directory', type=Path, default=ROOT.parent / 'standalone-user')
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()
    if args.show and args.user_directory == ROOT.parent / 'standalone-user': args.user_directory = ROOT.parent / 'show-user'
    if args.build is None:
        pointer = ROOT.parent / ('show-runtime.json' if args.show else 'standalone-runtime.json')
        if not pointer.is_file(): raise RuntimeError('Run Build standalone locally.bat to prepare a launch copy')
        build = Path(json.loads(pointer.read_text(encoding='utf-8'))['runtime']).resolve()
    else:
        build = args.build.resolve()
    version = json.loads((ROOT / 'upstream.lock.json').read_text(encoding='utf-8'))['godot']
    godot = args.godot or ROOT / '.tools/Godot' / f'Godot_v{version}_win64_console.exe'
    for required in (godot, build / 'Cardinal/resources/PluginManifests/Cardinal.json',
                     build / 'rack/project.godot', build / 'rack/bin/Cardinal3DEngine.dll',
                     build / 'rack/bin/Cardinal3DExtension.dll'):
        if not required.is_file(): raise RuntimeError(f'Standalone test is not built yet: {required}')
    env = os.environ.copy()
    env['CARDINAL_3D_EMBEDDED'] = '1'
    session = args.session or Path(env.get('CARDINAL_SHOW_SESSION') or ROOT / '.tools/show-room-session.json')
    env['CARDINAL_SHOW_SESSION'] = str(session.resolve())
    if args.session is not None and not session.is_file():
        raise RuntimeError(f'Show relay connection file not found: {session}')
    if args.show and not session.is_file():
        print('No Show relay connection file found. Start the relay first, or use --session to select its file.', flush=True)
    if args.show: env['CARDINAL_SHOW_AUTO_START'] = '1'
    env['CARDINAL_EMBEDDED_RESOURCES'] = str(build / 'Cardinal')
    env['CARDINAL_EMBEDDED_USER_DIR'] = str(args.user_directory.resolve())
    env.pop('CARDINAL_EMBEDDED_PATCH', None)
    patch = args.patch
    # Seed only the first launch from the user's last saved rack, read-only.
    if patch is None and not (args.user_directory / 'autosave.vcv').is_file():
        saved = ROOT / 'examples/show-starter.json' if args.show else ROOT.parent / 'Quest starter.vcv'
        if saved.is_file(): patch = saved
    if patch is not None:
        if not patch.is_file(): raise RuntimeError(f'Patch not found: {patch}')
        env['CARDINAL_EMBEDDED_PATCH'] = str(patch.resolve())
    env['CARDINAL_3D_XR'] = '1' if args.vr else '0'
    if args.vr: env['XR_RUNTIME_JSON'] = str(meta_runtime())
    command = [str(godot.resolve()), '--path', str(build / 'rack'),
        '--rendering-driver', 'opengl3', '--xr-mode', 'on' if args.vr else 'off']
    print('Standalone test: Cardinal engine and audio inside one Godot process.', flush=True)
    print(f'Patch recovery and audio settings: {args.user_directory.resolve()}', flush=True)
    if args.vr: print('Connect Quest Link before starting this test.', flush=True)
    if args.dry_run:
        print('PASS: launcher paths and Meta runtime validated; no app started.', flush=True)
        return 0
    args.user_directory.mkdir(parents=True, exist_ok=True)
    # Source builds do not ship .godot; register class_name scripts and import
    # assets before loading main.tscn. Repeat for explicit builds after rebuilds.
    if args.build is not None or not (build / 'rack/.godot/global_script_class_cache.cfg').is_file():
        from check_frontend import run
        print('Preparing Godot script classes and assets...', flush=True)
        run([str(godot.resolve()), '--path', str(build / 'rack'), '--headless',
             '--editor', '--import', '--xr-mode', 'off', '--log-file',
             str((args.user_directory / 'import.log').resolve())], env, timeout=120)
    command.extend(['--log-file', str((args.user_directory / 'session.log').resolve())])
    return subprocess.call(command, cwd=build, env=env)

if __name__ == '__main__':
    try: sys.exit(main())
    except Exception as error:
        print(f'Setup needed: {error}', file=sys.stderr)
        sys.exit(1)
