#!/usr/bin/env python3
"""Reject changes outside the UI/build overlay and exact Host Audio capture fix."""
from pathlib import Path
import json
import subprocess
import sys
import argparse
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"scripts"))
from host_audio_cursor import patch_host_audio
from mixer_meter_overlay import patch_mixer_meter
from source_snapshot import verify_snapshot

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--source', type=Path, default=ROOT / 'vendor/Cardinal')
source = parser.parse_args().source.resolve()
def git(*args):
    return subprocess.check_output(['git', '-C', str(source), *args], text=True)

pin = json.loads((ROOT / 'upstream.lock.json').read_text())
if (source / '.source-snapshot.json').is_file() and not (source / '.git').exists():
    count = verify_snapshot(source, pin['commit'])
    print(f'PASS: {count} matching corresponding-source files, exact pin and snapshot hashes')
    sys.exit(0)
assert git('rev-parse', 'HEAD').strip() == pin['commit']
changed = set(git('diff', 'HEAD', '--name-only').splitlines())
allowed = {'src/CardinalUI.cpp', 'src/override/ModuleWidget.cpp', 'src/override/Window.cpp', 'src/Makefile.cardinal.mk', 'plugins/Makefile', 'dpf', 'src/Rack', 'plugins/Cardinal/src/HostAudio.cpp', 'plugins/MindMeldModular'}
assert changed <= allowed, f'Unexpected upstream changes: {changed-allowed}'
mixer = source/'plugins/MindMeldModular'
mixer_changed = set(subprocess.check_output(['git','-C',str(mixer),'diff','HEAD','--name-only'],text=True).splitlines())
assert mixer_changed <= {'src/comp/VuMeters.hpp'}, 'Unexpected MindMeld DSP/source changes'
meter_original = subprocess.check_output(['git','-C',str(mixer),'show','HEAD:src/comp/VuMeters.hpp'],text=True)
assert (mixer/'src/comp/VuMeters.hpp').read_text() == patch_mixer_meter(meter_original), 'Unexpected mixer UI overlay'

audio_original=git('show','HEAD:plugins/Cardinal/src/HostAudio.cpp')
assert (source/'plugins/Cardinal/src/HostAudio.cpp').read_text()==patch_host_audio(audio_original),'Unexpected Host Audio edit beyond the input cursor fix'

def verify_overlay(relative, replacements):
    checkout = source / relative
    modified = set(subprocess.check_output(['git', '-C', str(checkout), 'diff', 'HEAD', '--name-only'], text=True).splitlines())
    assert modified <= set(replacements), f'Unexpected changes in {relative}: {modified-set(replacements)}'
    for filename, edits in replacements.items():
        original = subprocess.check_output(['git', '-C', str(checkout), 'show', f'HEAD:{filename}'], text=True)
        expected = original
        for old, new in edits:
            expected = expected.replace(old, new)
        actual = (checkout / filename).read_text()
        assert actual in (original, expected), f'Unexpected edit: {relative}/{filename}'

# Match precisely the Windows resource discovery overlay in install_bridge.py.
verify_overlay('dpf', {
    'distrho/src/DistrhoUtils.cpp': [('  #ifndef STATIC_BUILD\n    if (filename.isNotEmpty())', '  #if !defined(STATIC_BUILD) || defined(DISTRHO_OS_WINDOWS)\n    if (filename.isNotEmpty())')],
    'distrho/src/DistrhoPluginJACK.cpp': [
        ('#ifndef STATIC_BUILD\n# include "../DistrhoPluginUtils.hpp"', '#if !defined(STATIC_BUILD) || defined(DISTRHO_OS_WINDOWS)\n# include "../DistrhoPluginUtils.hpp"'),
        ('   #ifndef STATIC_BUILD\n    // find plugin bundle', '   #if !defined(STATIC_BUILD) || defined(DISTRHO_OS_WINDOWS)\n    // find plugin bundle')],
})
rack_changes = set(subprocess.check_output(['git', '-C', str(source / 'src/Rack'), 'diff', 'HEAD', '--name-only'], text=True).splitlines())
assert rack_changes <= {'dep/speexdsp'}, f'Unexpected Rack changes: {rack_changes}'
# Cardinal's pinned deps/Makefile applies this visibility-only configure patch.
verify_overlay('src/Rack/dep/speexdsp', {'configure.ac': [('__attribute__((visibility("default")))', '')]})
for line in git('submodule', 'status', '--recursive').splitlines():
    assert line.startswith(' '), f'Unpinned submodule: {line}'
print('PASS: pinned recursive source; UI/build overlay and exact Windows resource/configure patches; module DSP unchanged apart from the exact Host Audio capture cursor correction')
