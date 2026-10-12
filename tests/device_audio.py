#!/usr/bin/env python3
"""Real engine input routing and silent hardware-stream lifecycle checks."""
import ctypes as c
import json
from pathlib import Path
import tempfile
import time
import struct
root=Path(__file__).resolve().parents[1]
d=c.CDLL(str(root/'dist/embedded-full/rack/bin/Cardinal3DEngine.dll'))
d.c3d_create.argtypes=[c.c_char_p,c.c_char_p,c.c_double,c.c_uint32];d.c3d_create.restype=c.c_void_p
d.c3d_destroy.argtypes=[c.c_void_p]
d.c3d_load.argtypes=[c.c_void_p,c.c_char_p];d.c3d_load.restype=c.c_int
d.c3d_process.argtypes=[c.c_void_p,*([c.POINTER(c.c_float)]*4),c.c_uint32]
d.c3d_show_audio.argtypes=[c.c_void_p,c.POINTER(c.c_uint32)];d.c3d_show_audio.restype=c.POINTER(c.c_uint8)
d.c3d_show_json.argtypes=[c.c_void_p];d.c3d_show_json.restype=c.c_char_p
d.c3d_device_catalog.restype=c.c_char_p;d.c3d_device_status.restype=c.c_char_p
d.c3d_device_open.argtypes=[c.c_void_p,c.c_char_p,c.c_uint32];d.c3d_device_open.restype=c.c_int
with tempfile.TemporaryDirectory() as tmp:
 h=d.c3d_create(str(root/'dist/embedded-full/Cardinal').encode(),tmp.encode(),48000,256);assert h
 try:
  patch=dict(version='2.4.1',modules=[dict(id=1,plugin='Cardinal',model='HostAudio2',pos=[0,0],params=[]),dict(id=2,plugin='Cardinal3DShow',model='ShowSpeaker',pos=[20,0],params=[])],cables=[dict(id=3,outputModuleId=1,outputId=0,inputModuleId=2,inputId=0,color='#ffffff')])
  p=Path(tmp)/'input.json';p.write_text(json.dumps(patch));assert d.c3d_load(h,str(p).encode())
  inputs=[(c.c_float*256)(*([value]*256)) for value in [.25,-.4]];outputs=[(c.c_float*256)() for _ in range(2)]
  assert d.c3d_process(h,*inputs,*outputs,256)
  n=c.c_uint32();data=c.string_at(d.c3d_show_audio(h,c.byref(n)),n.value)
  assert data[:4]==b'C3DA' and struct.unpack_from('<I',data,4)[0]==1
  samples=struct.unpack_from('<256f',data,32);assert max(abs(s-.25) for s in samples)<1e-6,'HostAudio left input must reach the Show speaker independently of right input'
  # WASAPI-only enumeration avoids opening every disconnected ASIO driver.
  config=dict(api=6,input_device=-1,output_device=999999,input_left=-1,input_right=-1,output_left=0,output_right=1,sample_rate=48000,buffer_size=256)
  assert not d.c3d_device_open(h,json.dumps(config).encode(),256)
  assert not json.loads(d.c3d_device_status())['running']
  # The default WASAPI output id is supplied by the caller to avoid global probe latency.
  import os
  if 'CARDINAL_TEST_OUTPUT' in os.environ:
   config['output_device']=int(os.environ['CARDINAL_TEST_OUTPUT'])
   config['api']=int(os.environ.get('CARDINAL_TEST_API','6'))
   if config['api']==7:config.update(input_device=config['output_device'],input_left=0,input_right=31,output_left=32,output_right=33)
   assert d.c3d_device_open(h,json.dumps(config).encode(),256),d.c3d_device_status()
   before=json.loads(d.c3d_show_json(h))['frame'];time.sleep(.25)
   state=json.loads(d.c3d_device_status());after=json.loads(d.c3d_show_json(h))['frame']
   assert state['running'] and after>before and state['sample_rate']==48000
   d.c3d_device_close();assert not json.loads(d.c3d_device_status())['running']
   print('Hardware callback advances engine; negotiated buffer:',state['buffer_size'])
  print('PASS: physical-input patch path, invalid-device cleanup, stream lifecycle')
 finally:d.c3d_destroy(h)
