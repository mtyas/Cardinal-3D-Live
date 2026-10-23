#!/usr/bin/env python3
"""Compare complete descriptor polling with live-value polling on the same engine."""
import argparse,ctypes as c,json,tempfile,time,statistics
from pathlib import Path

def main():
 p=argparse.ArgumentParser();p.add_argument('--build',type=Path,required=True);p.add_argument('--report',type=Path,required=True);p.add_argument('--patch',type=Path);a=p.parse_args()
 dll=c.CDLL(str((a.build/'rack/bin/Cardinal3DEngine.dll').resolve()));dll.c3d_create.argtypes=[c.c_char_p,c.c_char_p,c.c_double,c.c_uint32];dll.c3d_create.restype=c.c_void_p;dll.c3d_destroy.argtypes=[c.c_void_p];dll.c3d_load.argtypes=[c.c_void_p,c.c_char_p];dll.c3d_messages_json.argtypes=[c.c_void_p,c.c_char_p];dll.c3d_messages_json.restype=c.c_char_p
 results=[]
 with tempfile.TemporaryDirectory(prefix='cardinal-live-bench-') as user:
  host=dll.c3d_create(str((a.build/'Cardinal').resolve()).encode(),user.encode(),48000,256);assert host
  try:
   for size in ([0] if a.patch else [1,16,64]):
    patch=a.patch
    if not patch:
     patch=Path(user)/'fixture.json';patch.write_text(json.dumps({'version':'2.4.1','modules':[dict(id=i+1,plugin='Fundamental',model='VCO',pos=[i*15,0],params=[]) for i in range(size)],'cables':[]}),encoding='utf-8')
    assert dll.c3d_load(host,str(patch.resolve()).encode());hello=json.loads(dll.c3d_messages_json(host,b'{"op":"hello","version":1,"request":0}'));state=next(m for m in hello if m['type']=='snapshot');assert state['supports_live_values']
    sizes={};samples={'full':[],'live':[]}
    for i in range(80):
     for mode in ['full','live']:
      command=b'[]' if mode=='full' else b'[{"op":"poll_live","request":0}]'
      start=time.perf_counter_ns();raw=dll.c3d_messages_json(host,command);elapsed=(time.perf_counter_ns()-start)/1e6;decoded=json.loads(raw)
      assert any(m['type']==('snapshot' if mode=='full' else 'live_values') for m in decoded)
      if i>10:samples[mode].append(elapsed);sizes[mode]=len(raw)
    results.append({'modules':len(state['modules']),'meters':sum(c['kind']=='meter' for m in state['modules'] for c in m['controls']),'reply_bytes':sizes,'median_ms':{k:statistics.median(v) for k,v in samples.items()},'p95_ms':{k:sorted(v)[int(.95*(len(v)-1))] for k,v in samples.items()}})
  finally:dll.c3d_destroy(host)
 report={'note':'Owner-thread polling only, no audio device or WAN latency measurement', 'results':results};a.report.write_text(json.dumps(report,indent=2),encoding='utf-8');print(json.dumps(report))
if __name__=='__main__':main()
