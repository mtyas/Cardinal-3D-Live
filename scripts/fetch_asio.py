#!/usr/bin/env python3
"""Pinned official ASIO SDK, used under its GPL-3.0-only option."""
from pathlib import Path
import hashlib
import io
import urllib.request
import zipfile
ROOT = Path(__file__).resolve().parents[1]
target = ROOT / '.tools/asio-sdk'
digest = 'd5ebf0c20dd2c5f43771fd0c1418f4b361bf52434ee670097cfa6b3a335e2eca'
if not (target / 'ASIOSDK/common/asio.h').is_file():
    data = urllib.request.urlopen('https://download.steinberg.net/sdk_downloads/ASIO-SDK_2.3.4_2025-10-15.zip', timeout=60).read()
    assert hashlib.sha256(data).hexdigest() == digest, 'ASIO SDK checksum mismatch'
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        for entry in archive.infolist():
            path = (target / entry.filename).resolve()
            assert path.is_relative_to(target.resolve()), 'Unsafe SDK archive path'
        archive.extractall(target)
    (target / 'source.sha256').write_text(digest + '\n')
print('Pinned ASIO 2.3.4 source available; GPLv3 option selected.')
