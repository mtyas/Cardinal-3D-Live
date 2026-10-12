#!/usr/bin/env python3
"""Reject real access tokens/private keys in a public source or unpacked release."""
from pathlib import Path
import argparse,re,sys
parser=argparse.ArgumentParser()
parser.add_argument('--root',type=Path,default=Path(__file__).resolve().parents[1])
args=parser.parse_args()
patterns=[r'umbrelmcp_[A-Za-z0-9_]{20,}',r'gh[opusr]_[A-Za-z0-9]{20,}',
 r'github_pat_[A-Za-z0-9_]{30,}',r'\b[0-9]{8,12}:[A-Za-z0-9_-]{30,}',
 r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----']
failures=[];count=0
for path in args.root.rglob('*'):
 if not path.is_file() or any(p in ('.git','.tools','node_modules','.godot') for p in path.parts):continue
 try:text=path.read_text(encoding='utf-8')
 except (UnicodeDecodeError,OSError):continue
 count+=1
 if any(re.search(pattern,text) for pattern in patterns):failures.append(str(path.relative_to(args.root)))
if failures:
 print('Potential private credentials in: '+', '.join(failures),file=sys.stderr);sys.exit(1)
print(f'PASS: {count} text files scanned; no token/private-key patterns found.')
