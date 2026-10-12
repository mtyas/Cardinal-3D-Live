"""Verify extracted corresponding sources without depending on Git metadata."""
from pathlib import Path
import hashlib
import json

def verify_snapshot(source, expected_commit):
    source = Path(source).resolve()
    manifest = json.loads((source / '.source-snapshot.json').read_text())
    if manifest.get('commit') != expected_commit:
        raise RuntimeError('Source archive pin mismatch')
    hashes = manifest.get('sha256', {})
    if not hashes or 'plugins/Makefile' not in hashes:
        raise RuntimeError('Incomplete source snapshot manifest')
    for name, digest in hashes.items():
        path = (source / name).resolve()
        if not path.is_relative_to(source):
            raise RuntimeError('Unsafe source path: ' + name)
        if not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest() != digest:
            raise RuntimeError('Source archive changed: ' + name)
    return len(hashes)
