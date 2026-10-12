"""Measure audio continuity during head motion and loud-source mix headroom."""
import ctypes as c
import json, math, os, tempfile
from pathlib import Path
root=Path(__file__).resolve().parents[1]
d=c.CDLL(str(root/'dist/embedded-full/rack/bin/Cardinal3DEngine.dll'))
d.c3d_create.argtypes=[c.c_char_p,c.c_char_p,c.c_double,c.c_uint32];d.c3d_create.restype=c.c_void_p
d.c3d_load.argtypes=[c.c_void_p,c.c_char_p];d.c3d_destroy.argtypes=[c.c_void_p]
d.c3d_show_json.argtypes=[c.c_void_p];d.c3d_show_json.restype=c.c_char_p
d.c3d_spatial_monitor.argtypes=[c.c_void_p,c.c_int]+[c.c_float]*6
d.c3d_process.argtypes=[c.c_void_p]+[c.POINTER(c.c_float)]*4+[c.c_uint32]
array=c.c_float*256
with tempfile.TemporaryDirectory() as directory:
 h=d.c3d_create(str(root/'dist/embedded-full/Cardinal').encode(),directory.encode(),48000,256)
 try:
  def load(sources,gain):
   modules=[dict(id=1,plugin='Cardinal',model='HostAudio2',pos=[0,0],params=[])]
   modules += [dict(id=2+i,plugin='Cardinal3DShow',model='ShowSpeaker',pos=[10+i*10,0],params=[dict(id=0,value=gain)]) for i in range(sources)]
   cables=[dict(id=20+i,outputModuleId=1,outputId=0,inputModuleId=2+i,inputId=0,color='#ffffff') for i in range(sources)]
   p=Path(directory)/'check.json';p.write_text(json.dumps(dict(version='2.4.1',modules=modules,cables=cables)))
   assert d.c3d_load(h,str(p).encode());d.c3d_show_json(h)
  load(1,1)
  frequency=2000;omega=2*math.pi*frequency/48000;tail=[]
  for block in range(200):
   # Tiny pose jitter exercises transitions between adjacent ear-delay samples.
   x=.03 if block%2 else -.03
   assert d.c3d_spatial_monitor(h,1,x,1.5,0,1,0,0)
   left=array(*[.2*math.sin((block*256+i)*omega) for i in range(256)]);right=array();outl=array();outr=array()
   assert d.c3d_process(h,left,right,outl,outr,256)
   if block>20:tail.extend(outr)
  residual=max(abs(tail[i]-2*math.cos(omega)*tail[i-1]+tail[i-2]) for i in range(2,len(tail)))
  print('Ear-delay continuity residual:',round(residual,7))
  if not os.environ.get('CARDINAL_MONITOR_BENCHMARK_ONLY'):assert residual<.002,'Head pose updates must not introduce discontinuous sample steps'
  load(2,2);peak=0;plateau=longest=0
  d.c3d_spatial_monitor(h,1,-2,1.5,-3,1,0,0)
  for block in range(100):
   left=array(*[.8*math.sin((block*256+i)*2*math.pi*1000/48000) for i in range(256)]);right=array();outl=array();outr=array()
   assert d.c3d_process(h,left,right,outl,outr,256)
   for value in outl:
    assert math.isfinite(value);peak=max(peak,abs(value));plateau=plateau+1 if block>10 and abs(value)>.9799 else 0;longest=max(longest,plateau)
  print('Loud-source peak:',round(peak,6),'longest clipping plateau:',longest)
  if not os.environ.get('CARDINAL_MONITOR_BENCHMARK_ONLY'):assert peak<=.98001 and longest<5,'Loud sources need headroom without long flat clipping plateaus'
  print('Baseline measurements only' if os.environ.get('CARDINAL_MONITOR_BENCHMARK_ONLY') else 'PASS: moving-head audio continuity and loud-source monitor headroom')
 finally:d.c3d_destroy(h)
