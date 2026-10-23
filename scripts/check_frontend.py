#!/usr/bin/env python3
"""Import and test a disposable frontend; script errors and timeouts are failures."""
from pathlib import Path
import argparse
import os
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]

def run(command, env, timeout=60, marker=False):
    process = subprocess.Popen(list(map(str, command)), env=env, stdout=subprocess.PIPE,
                               stderr=subprocess.STDOUT, text=True, encoding='utf-8', errors='replace')
    try:
        output, _ = process.communicate(timeout=timeout)
    except subprocess.TimeoutExpired:
        if os.name == 'nt':
            subprocess.run(['taskkill', '/PID', str(process.pid), '/T', '/F'], capture_output=True)
        else:
            process.kill()
        output, _ = process.communicate()
        raise RuntimeError('Frontend check timed out\n' + output)
    print(output, end='')
    if process.returncode or 'SCRIPT ERROR:' in output or 'ERROR:' in output or (marker and 'PASS' not in output):
        raise RuntimeError('Frontend check failed')

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('godot', type=Path)
    parser.add_argument('script')
    parser.add_argument('--graphics', action='store_true')
    parser.add_argument('--project', type=Path, default=ROOT / 'godot')
    parser.add_argument('--integration', action='store_true', help='Keep explicit native/relay environment for prepared integration tests')
    parser.add_argument('--timeout', type=int, default=60, help='Maximum test seconds (1–300); extend explicitly for sustained streaming checks')
    args = parser.parse_args()
    if not 1 <= args.timeout <= 300: parser.error('--timeout must be between 1 and 300 seconds')
    script = (args.project / args.script[6:] if args.script.startswith('res://') else Path(args.script)).resolve()
    if not script.is_file(): parser.error('Test script does not exist: ' + str(script))
    if script.stem in ('show_publish', 'frontend_live_stream') and not args.integration:
        parser.error('This test needs a prepared native/relay harness; use --integration with its environment')
    graphics = args.graphics or script.stem == 'frontend_desktop'
    with tempfile.TemporaryDirectory(prefix='cardinal-frontend-') as scratch:
        scratch = Path(scratch)
        project = scratch / 'project'
        shutil.copytree(args.project, project, ignore=shutil.ignore_patterns('.godot', '*.log'))
        shutil.copytree(ROOT/'tests', scratch/'tests', ignore=shutil.ignore_patterns('__pycache__'))
        env = os.environ.copy()
        if not args.integration:
            for key in list(env):
                if key.startswith(('CARDINAL_', 'XR_RUNTIME')): env.pop(key)
        env['CARDINAL_EMBEDDED_USER_DIR'] = str(scratch / 'engine-settings')
        Path(env['CARDINAL_EMBEDDED_USER_DIR']).mkdir()
        for name in ('APPDATA', 'LOCALAPPDATA', 'XDG_DATA_HOME', 'XDG_CONFIG_HOME'):
            env[name] = str(scratch / name)
            Path(env[name]).mkdir()
        base = [args.godot.resolve(), '--audio-driver', 'Dummy', '--path', project,
                '--log-file', scratch / 'godot.log']
        run(base + ['--headless', '--editor', '--quit-after', '60', '--frame-delay', '100'], env)
        display = ['--rendering-method', 'gl_compatibility', '--resolution', '1440x900'] if graphics else ['--headless']
        run(base + display + ['--script', script], env, timeout=args.timeout, marker=True)

if __name__ == '__main__': main()
