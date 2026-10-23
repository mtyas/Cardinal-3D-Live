#!/usr/bin/env python3
"""Measure full versus compact semantic replies; synthetic patch, no audio device."""
import argparse,ctypes as c,json,statistics,tempfile,time
from pathlib import Path

def main():
 p=argparse.ArgumentParser();p.add_argument('--dll',type=Path,required=True);p.add_argument('--resources',type=Path,required=True);p.add_argument('--report',type=Path,required=True);a=p.parse_args()
 d=c.CDLL(str(a.dll.resolve()));d.c3d_create.argtypes=[c.c_char_p,c.c_char_p,c.c_double,c.c_uint32];d.c3d_create.restype=c.c_void_p;d.c3d_destroy.argtypes=[c.c_void_p];d.c3d_load.argtypes=[c.c_void_p,c.c_char_p];d.c3d_messages_json.argtypes=[c.c_void_p,c.c_char_p];d.c3d_messages_json.restype=c.c_char_p
 reports=[]
 with tempfile.TemporaryDirectory(prefix='cardinal-control-bench-') as folder:
  host=d.c3d_create(str(a.resources.resolve()).encode(),folder.encode(),48000,256);assert host
  try:
   for size in [1,16,64]:
    patch=Path(folder)/'fixture.vcv';patch.write_text(json.dumps({'version':'2.4.1','modules':[{'id':i+1,'plugin':'Fundamental','model':'VCO','pos':[i*15,0],'params':[]} for i in range(size)],'cables':[]}));assert d.c3d_load(host,str(patch).encode())
    messages=json.loads(d.c3d_messages_json(host,b'{"op":"hello","version":1,"request":0}'));state=next(m for m in messages if m['type']=='snapshot')
    base={'op':'parameter_edit','request':1,'module':'1','param':2,'gesture':'bench','generation':state['generation'],'phase':'begin'}
    assert any(m.get('ok') for m in json.loads(d.c3d_messages_json(host,json.dumps(base).encode())) if m['type']=='ack')
    samples={'full':[],'compact':[]};sizes={}
    for i in range(120):
     for compact in [False,True] if i%2 else [True,False]:
      mode='compact' if compact else 'full';cmd=json.dumps({**base,'phase':'update','value':(i%100)/100,'reply_only':compact}).encode()
      started=time.perf_counter_ns();raw=d.c3d_messages_json(host,cmd);elapsed=(time.perf_counter_ns()-started)/1e6
      decoded=json.loads(raw);assert next(m for m in decoded if m['type']=='ack')['ok'];assert any(m['type']=='snapshot' for m in decoded)!=compact
      if i>=20:samples[mode].append(elapsed);sizes[mode]=len(raw)
    row={'modules':size,'reply_bytes':sizes,'median_ms':{mode:statistics.median(values) for mode,values in samples.items()},'p95_ms':{mode:sorted(values)[94] for mode,values in samples.items()}}
    reports.append(row)
    d.c3d_messages_json(host,json.dumps({**base,'phase':'end','reply_only':True}).encode())
  finally:d.c3d_destroy(host)
 report={'note':'Synthetic VCO patch; owner-thread native call time only, not WAN/headset/audio latency','results':reports};a.report.write_text(json.dumps(report,indent=2),encoding='utf-8');print(json.dumps(report))
if __name__=='__main__':main()
