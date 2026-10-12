#!/usr/bin/env python3
"""Measure native block deadlines under concurrent scene polling; no audio device."""
import argparse, ctypes as c, json, math, statistics, tempfile, threading, time
from pathlib import Path

def summary(values):
    values=sorted(values)
    return {name:values[min(len(values)-1,int((len(values)-1)*fraction))] for name,fraction in [('p50',.5),('p95',.95),('p99',.99),('max',1)]}

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--dll',type=Path,required=True);parser.add_argument('--resources',type=Path,required=True);parser.add_argument('--report',type=Path,required=True);parser.add_argument('--sources',type=int,default=16);parser.add_argument('--blocks',type=int,default=4000);args=parser.parse_args()
    d=c.CDLL(str(args.dll.resolve()));fp=c.POINTER(c.c_float)
    d.c3d_create.argtypes=[c.c_char_p,c.c_char_p,c.c_double,c.c_uint32];d.c3d_create.restype=c.c_void_p
    d.c3d_load.argtypes=[c.c_void_p,c.c_char_p];d.c3d_destroy.argtypes=[c.c_void_p]
    d.c3d_process.argtypes=[c.c_void_p,fp,fp,fp,fp,c.c_uint32]
    d.c3d_show_json.argtypes=[c.c_void_p];d.c3d_show_json.restype=c.c_char_p
    d.c3d_spatial_monitor.argtypes=[c.c_void_p,c.c_int]+[c.c_float]*6
    with tempfile.TemporaryDirectory(prefix='cardinal-foundation-') as folder:
        patch=Path(folder)/'patch.json'
        modules=[dict(id=1,plugin='Cardinal',model='HostAudio2',pos=[0,0],params=[])]
        modules += [dict(id=i+2,plugin='Cardinal3DShow',model='ShowSpeaker',pos=[(i+1)*10,0],params=[]) for i in range(args.sources)]
        cables=[dict(id=i+100,outputModuleId=1,outputId=0,inputModuleId=i+2,inputId=0,color='#ffffff') for i in range(args.sources)]
        patch.write_text(json.dumps(dict(version='2.4.1',modules=modules,cables=cables)))
        started=time.perf_counter();host=d.c3d_create(str(args.resources.resolve()).encode(),folder.encode(),48000,256);assert host
        startup=(time.perf_counter()-started)*1000
        try:
            assert d.c3d_load(host,str(patch).encode());assert d.c3d_show_json(host)
            assert d.c3d_spatial_monitor(host,1,0,1.5,0,1,0,0)
            durations=[];errors=[];finished=threading.Event();polls=[]
            def audio():
                arrays=[(c.c_float*256)() for _ in range(4)]
                for i in range(256):arrays[0][i]=.1*math.sin(i*.04)
                try:
                    for block in range(args.blocks):
                        start=time.perf_counter_ns();ok=d.c3d_process(host,*arrays,256);elapsed=(time.perf_counter_ns()-start)/1e6
                        if not ok:errors.append('process failed')
                        if block>=100:durations.append(elapsed)
                        if not all(math.isfinite(x) for x in arrays[2]):errors.append('nonfinite audio')
                finally:finished.set()
            thread=threading.Thread(target=audio);thread.start()
            while not finished.is_set():
                start=time.perf_counter_ns();state=json.loads(d.c3d_show_json(host));polls.append((time.perf_counter_ns()-start)/1e6)
                assert len(state['speakers'])==args.sources
                time.sleep(.001)
            thread.join();assert not errors,errors
            report={'sources':args.sources,'blocks':args.blocks,'startup_ms':startup,'audio_block_ms':summary(durations),'block_deadline_ms':256/48,'deadline_misses':sum(t>256/48 for t in durations),'scene_poll_ms':summary(polls),'scene_polls':len(polls),'hardware_audio':False,'note':'Unpaced DSP stress with concurrent 1ms UI polls; includes OS/Python scheduling, not headset latency.'}
            args.report.parent.mkdir(parents=True,exist_ok=True);args.report.write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
        finally:assert d.c3d_destroy(host)
if __name__=='__main__':main()
