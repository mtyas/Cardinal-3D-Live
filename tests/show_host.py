#!/usr/bin/env python3
"""Verify real native Show audio isolation, timestamps, CV lighting and save/load."""
import ctypes as c
import json
from pathlib import Path
import struct
import tempfile

root = Path(__file__).resolve().parents[1]
dll = c.CDLL(str(root / 'dist/embedded-full/rack/bin/Cardinal3DEngine.dll'))
dll.c3d_create.argtypes = [c.c_char_p,c.c_char_p,c.c_double,c.c_uint32]
dll.c3d_create.restype = c.c_void_p
dll.c3d_destroy.argtypes = [c.c_void_p]
dll.c3d_load.argtypes = [c.c_void_p,c.c_char_p]
dll.c3d_load.restype = c.c_int
dll.c3d_save.argtypes = [c.c_void_p,c.c_char_p]
dll.c3d_save.restype = c.c_int
for name in ['c3d_show_json','c3d_error']:
    getattr(dll,name).argtypes = [c.c_void_p]
    getattr(dll,name).restype = c.c_char_p
dll.c3d_show_audio.argtypes = [c.c_void_p,c.POINTER(c.c_uint32)]
dll.c3d_show_audio.restype = c.POINTER(c.c_uint8)
fp = c.POINTER(c.c_float)
dll.c3d_process.argtypes = [c.c_void_p,fp,fp,fp,fp,c.c_uint32]
dll.c3d_process.restype = c.c_int
with tempfile.TemporaryDirectory(prefix='cardinal-show-check-') as directory:
    patch = Path(directory)/'show.vcv'
    modules = [dict(id=1,plugin='Fundamental',model='VCO',pos=[0,0],params=[])]
    modules += [dict(id=i,plugin='Cardinal3DShow',model='ShowSpeaker',pos=[i*10,0],params=[]) for i in [2,3]]
    modules += [dict(id=4,plugin='Cardinal3DShow',model='ShowLight',pos=[40,0],params=[])]
    patch.write_text(json.dumps(dict(version='2.4.1',modules=modules,cables=[dict(id=5,outputModuleId=1,outputId=0,inputModuleId=2,inputId=0,color='#65e7ff'),dict(id=6,outputModuleId=1,outputId=0,inputModuleId=4,inputId=0,color='#bd83ff') ])))
    host = dll.c3d_create(str(root/'dist/embedded-full/Cardinal').encode(),directory.encode(),48000,256)
    assert host, dll.c3d_error(None)
    try:
        assert dll.c3d_load(host,str(patch).encode()),dll.c3d_error(host)
        arrays = [(c.c_float*256)() for _ in range(4)]
        previous = {}; tone = []; silent = []; brightness = []
        for step in range(40):
            assert dll.c3d_process(host,*arrays,256)
            state = json.loads(dll.c3d_show_json(host))
            assert len(state['speakers'])==2 and len(state['lights'])==1,state
            brightness.append(state['lights'][0]['values'][0])
            size = c.c_uint32(); pointer = dll.c3d_show_audio(host,c.byref(size))
            packet = c.string_at(pointer,size.value)
            assert packet[:4]==b'C3DA'
            count,=struct.unpack_from('<I',packet,4); offset=8
            assert count==2
            for _ in range(count):
                id,frame,rate,n=struct.unpack_from('<QQII',packet,offset);offset+=24
                samples=struct.unpack_from('<'+str(n)+'f',packet,offset);offset+=4*n
                assert rate==48000 and n==256
                if id in previous:assert frame==previous[id]
                previous[id]=frame+n
                (tone if id==2 else silent).extend(samples)
            assert offset==len(packet)
        assert max(map(abs,tone))>.1,'Connected speaker must contain VCO audio'
        assert max(map(abs,silent))==0,'Unconnected source must not leak another speaker'
        assert max(brightness)-min(brightness)>.1,'CV must drive brightness'
        saved=Path(directory)/'saved.vcv'
        assert dll.c3d_save(host,str(saved).encode())
        assert dll.c3d_load(host,str(saved).encode())
        assert len(json.loads(dll.c3d_show_json(host))['speakers'])==2
        # Real hardware-input CV drives speaker gain, position and direction.
        cv_patch=dict(version='2.4.1',modules=[dict(id=10,plugin='Cardinal',model='HostAudio2',pos=[0,0],params=[]),dict(id=11,plugin='Cardinal3DShow',model='ShowSpeaker',pos=[20,0],params=[])],cables=[dict(id=20+i,outputModuleId=10,outputId=0 if i==0 else 1,inputModuleId=11,inputId=port,color='#ffffff') for i,port in enumerate([0,1,2,5])])
        patch.write_text(json.dumps(cv_patch));assert dll.c3d_load(host,str(patch).encode())
        arrays[0]=(c.c_float*256)(*([.25]*256));arrays[1]=(c.c_float*256)(*([.5]*256))
        for _ in range(3):assert dll.c3d_process(host,*arrays,256)
        cv_state=json.loads(dll.c3d_show_json(host))['speakers'][0]
        assert abs(cv_state['position'][0]-3)<1e-5,cv_state
        assert abs(cv_state['yaw']-90)<1e-5,cv_state
        size=c.c_uint32();pointer=dll.c3d_show_audio(host,c.byref(size));packet=c.string_at(pointer,size.value)
        n=struct.unpack_from('<I',packet,28)[0];samples=struct.unpack_from('<'+str(n)+'f',packet,32)
        assert abs(samples[-1]-.125)<1e-5,'Gain CV must scale the mono source'
        # All four object modules preserve CV, sample-clock phase and patch state.
        visual_modules=[dict(id=30+i,plugin='Cardinal3DShow',model=model,pos=[i*12,0],params=[]) for i,model in enumerate(['ShowFigure','ShowFountain','ShowParticles','ShowSculpture'])]
        visual_modules.append(dict(id=40,plugin='Cardinal',model='HostAudio2',pos=[50,0],params=[]))
        links=[dict(id=50+i,outputModuleId=40,outputId=1,inputModuleId=30+i,inputId=0,color='#ffd365') for i in range(4)]
        patch.write_text(json.dumps(dict(version='2.4.1',modules=visual_modules,cables=links)));assert dll.c3d_load(host,str(patch).encode())
        assert dll.c3d_process(host,*arrays,256)
        objects=json.loads(dll.c3d_show_json(host))['objects'];assert len(objects)==4
        assert {o['kind'] for o in objects}=={'figure','fountain','particles','sculpture'}
        assert all(abs(o['values'][0]-.5)<1e-6 for o in objects),'Activity CV must follow input voltage'
        assert all(o['phase']>0 and o['frequency']==1 for o in objects)
        # Add Clock/Reset cables, then send an actual pulse after a known period.
        links += [dict(id=60+i,outputModuleId=40,outputId=0,inputModuleId=30+i,inputId=12,color='#65e7ff') for i in range(4)]
        patch.write_text(json.dumps(dict(version='2.4.1',modules=visual_modules,cables=links)));assert dll.c3d_load(host,str(patch).encode())
        arrays[0]=(c.c_float*256)()
        for _ in range(100):assert dll.c3d_process(host,*arrays,256)
        arrays[0]=(c.c_float*256)(*([.5]*256));assert dll.c3d_process(host,*arrays,256)
        synced=json.loads(dll.c3d_show_json(host))['objects']
        assert all(abs(o['frequency']-1.875)<.05 for o in synced),synced
        assert max(o['phase'] for o in synced)-min(o['phase'] for o in synced)<1e-5,'Shared clock must align all four objects'
        assert dll.c3d_save(host,str(saved).encode());assert dll.c3d_load(host,str(saved).encode())
        assert len(json.loads(dll.c3d_show_json(host))['objects'])==4
        dll.c3d_spatial_monitor.argtypes=[c.c_void_p,c.c_int]+[c.c_float]*6;dll.c3d_spatial_monitor.restype=c.c_int
        patch.write_text(json.dumps(dict(version='2.4.1',modules=cv_patch['modules'],cables=[cv_patch['cables'][0]])));assert dll.c3d_load(host,str(patch).encode());json.loads(dll.c3d_show_json(host))
        arrays[0]=(c.c_float*256)(*([.25]*256));arrays[1]=(c.c_float*256)()
        assert dll.c3d_spatial_monitor(host,1,0,1.5,-3,1,0,0)
        def energy():
            for _ in range(20):assert dll.c3d_process(host,*arrays,256)
            return sum(abs(v) for v in arrays[2])/256,sum(abs(v) for v in arrays[3])/256
        left,right=energy();assert left>right*3 and left>.001,(left,right)
        assert dll.c3d_spatial_monitor(host,1,0,1.5,-3,-1,0,0)
        left2,right2=energy();assert right2>left2*3,(left2,right2)
        assert dll.c3d_spatial_monitor(host,1,0,1.5,20,-1,0,0)
        far=sum(energy());assert far<left+right,(far,left,right)
        assert dll.c3d_spatial_monitor(host,0,0,1.5,0,1,0,0)
        print('PASS: native speaker-only monitoring, head orientation and distance attenuation')
        board_modules=[dict(id=70,plugin='Cardinal3DShow',model='ShowChatBoard',pos=[0,0],params=[]),dict(id=40,plugin='Cardinal',model='HostAudio2',pos=[12,0],params=[])]
        patch.write_text(json.dumps(dict(version='2.4.1',modules=board_modules,cables=[dict(id=71,outputModuleId=40,outputId=0,inputModuleId=70,inputId=9,color='#65e7ff'),dict(id=72,outputModuleId=40,outputId=0,inputModuleId=40,inputId=0,color='#65e7ff')])));assert dll.c3d_load(host,str(patch).encode())
        arrays[0]=(c.c_float*256)(*([.5]*256))
        for _ in range(3):assert dll.c3d_process(host,*arrays,256)
        boards=json.loads(dll.c3d_show_json(host))['boards'];assert len(boards)==1 and len(boards[0]['values'])==14
        assert abs(boards[0]['values'][9]-8)<1e-5,boards
        assert sum(abs(v) for v in arrays[2])>1,'Ordinary Host Audio output must remain available when monitor is off'
        assert dll.c3d_spatial_monitor(host,1,0,1.5,0,1,0,0)
        for _ in range(3):assert dll.c3d_process(host,*arrays,256)
        assert max(abs(v) for v in arrays[2])==0 and max(abs(v) for v in arrays[3])==0,'Speaker-only monitor must suppress ordinary Host Audio output when no speaker is patched'
        assert dll.c3d_spatial_monitor(host,0,0,1.5,0,1,0,0)

        assert dll.c3d_save(host,str(saved).encode());assert dll.c3d_load(host,str(saved).encode());assert len(json.loads(dll.c3d_show_json(host))['boards'])==1
        print('PASS: shared chat board module, position CV and patch save/load')
        print('PASS: four visual modules, real activity CV, shared clock phase, tempo and save/load')
        print('PASS: speaker gain, position and direction CV use the real DSP input graph')
        print('PASS: independent mono audio, continuous sample frames, live CV lights, save/load')
    finally:dll.c3d_destroy(host)
