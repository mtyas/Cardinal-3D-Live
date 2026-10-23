"""Exercise semantic gestures against the real engine, with disposable settings."""
import argparse
import ctypes as c
import json
from pathlib import Path
import tempfile

parser = argparse.ArgumentParser()
parser.add_argument('--dll', type=Path, required=True)
parser.add_argument('--resources', type=Path, required=True)
args = parser.parse_args()
dll = c.CDLL(str(args.dll.resolve()))
dll.c3d_create.argtypes = [c.c_char_p, c.c_char_p, c.c_double, c.c_uint32]
dll.c3d_create.restype = c.c_void_p
dll.c3d_destroy.argtypes = [c.c_void_p]
dll.c3d_load.argtypes = [c.c_void_p, c.c_char_p]
dll.c3d_load.restype = c.c_int
dll.c3d_messages_json.argtypes = [c.c_void_p, c.c_char_p]
dll.c3d_messages_json.restype = c.c_char_p

with tempfile.TemporaryDirectory(prefix='cardinal-parameter-') as folder:
    patch = Path(folder) / 'test.vcv'
    patch.write_text(json.dumps(dict(version='2.4.1', modules=[
        dict(id=1, plugin='Fundamental', model='VCO', pos=[0, 0], params=[]),
        dict(id=2, plugin='Fundamental', model='VCO', pos=[15, 0], params=[]),
        dict(id=3, plugin='Fundamental', model='SEQ3', pos=[30, 0], params=[]),
        dict(id=4, plugin='Fundamental', model='SequentialSwitch2', pos=[45, 0], params=[])], cables=[])))
    host = dll.c3d_create(str(args.resources.resolve()).encode(), folder.encode(), 48000, 256)
    assert host
    try:
        assert dll.c3d_load(host, str(patch).encode())
        state = {}
        def send(op, ok=True, **fields):
            global state
            request = dict(op=op, request=1, generation=state.get('generation', ''))
            request.update(fields)
            raw = dll.c3d_messages_json(host, json.dumps(request).encode())
            assert raw
            messages = json.loads(raw)
            ack = next(m for m in messages if m['type'] == 'ack')
            assert ack['ok'] == ok, ack
            state = next(m for m in reversed(messages) if m['type'] == 'snapshot')
            return next((m for m in messages if m['type'] == 'parameter_value'), None)
        send('hello', version=1)
        knobs = [x for x in state['modules'][0]['controls'] if x['kind'] == 'knob']
        param = knobs[0]['id']
        def edit(phase, gesture='a', module='1', ok=True, **fields):
            return send('parameter_edit', ok=ok, phase=phase, gesture=gesture, module=module, param=param, **fields)
        def value(module='1'):
            m = next(m for m in state['modules'] if m['id'] == module)
            return next(x['normalized'] for x in m['controls'] if x.get('id') == param and x['kind'] == 'knob')
        initial = value()
        edit('begin')
        edit('begin', gesture='other', ok=False)
        for v in [0.2, 0.4, 0.7]:
            response = edit('update', value=v)
            assert abs(response['value'] - value()) < 1e-5
        final = value()
        edit('update', value=2, ok=False)
        edit('update', value=True, ok=False)
        assert value() == final
        edit('end')
        send('undo')
        assert abs(value() - initial) < 1e-5, 'One undo must revert the entire gesture'
        send('redo')
        assert abs(value() - final) < 1e-5
        edit('update', value=0.5, ok=False)
        edit('begin', gesture='b')
        edit('begin', gesture='c', module='2')
        edit('update', gesture='b', value=0.1)
        edit('update', gesture='c', module='2', value=0.9)
        edit('end', gesture='b')
        edit('end', gesture='c', module='2')
        edit('begin', gesture='d')
        edit('update', gesture='d', value=0.3)
        send('release')
        edit('update', gesture='d', value=0.4, ok=False)
        old_epoch = state['generation']
        assert dll.c3d_load(host, str(patch).encode())
        send('parameter_edit', ok=False, generation=old_epoch, phase='begin', gesture='stale', module='1', param=param)
        edit('begin', gesture='fresh')
        edit('end', gesture='fresh')
        send('parameter_edit', ok=False, phase='begin', gesture='bad', module='1', param=0.5)
        edit('begin', module='999', ok=False)
        edit('begin', gesture='local-test')
        send('pointer', module='1', x=0, y=0, phase='down', button=0)
        edit('update', gesture='local-test', value=0.2, ok=False)
        send('release')
        edit('begin', gesture='delete-test')
        edit('update', gesture='delete-test', value=0.25)
        send('remove', module='1')
        edit('update', gesture='delete-test', value=0.5, ok=False)
        seq = next(m for m in state['modules'] if m['id'] == '3')
        snapped = next(x for x in seq['controls'] if x.get('label') == 'Steps' and x['kind'] == 'knob')
        target = dict(module='3', param=snapped['id'], gesture='snap')
        send('parameter_edit', phase='begin', **target)
        response = send('parameter_edit', phase='update', value=0.5, **target)
        assert abs(response['value'] - 4 / 7) < 1e-5, 'Native Steps knob must snap 4.5 to 5'
        send('parameter_edit', phase='end', **target)
        switches = [(m['id'],x) for m in state['modules'] for x in m['controls'] if x['kind']=='switch']
        assert switches, 'Fixture must expose native switches/buttons'
        for module_id, switch in switches:
            target = dict(module=module_id, param=switch['id'], gesture='button')
            send('parameter_edit', phase='begin', **target)
            response=send('parameter_edit', phase='update', value=1, **target)
            assert response['value']==1
            send('release')  # Same native cleanup used by host takeover.
            control=next(x for m in state['modules'] if m['id']==module_id for x in m['controls'] if x['kind']=='switch' and x['id']==switch['id'])
            assert control['normalized']==(0 if switch.get('momentary') else 1)
        latch=next(x for mid,x in switches if mid=='4' and not x.get('momentary'))
        target=dict(module='4',param=latch['id'],gesture='latch')
        for normalized in [0,.5]:
            send('parameter_edit',phase='begin',**target)
            result=send('parameter_edit',phase='update',value=normalized,**target)
            assert result['value']==normalized
            send('parameter_edit',phase='end',**target)
        send('undo')
        assert next(x for m in state['modules'] if m['id']=='4' for x in m['controls'] if x['kind']=='switch')['normalized']==0
        send('redo')
        assert next(x for m in state['modules'] if m['id']=='4' for x in m['controls'] if x['kind']=='switch')['normalized']==.5
        assert any(x.get('momentary') for _,x in switches), 'Fixture must test stuck-button prevention'
        output=next(x['id'] for m in state['modules'] if m['id']=='2' for x in m['controls'] if x['kind']=='port' and x['direction']=='output')
        inputs=[x['id'] for m in state['modules'] if m['id']=='3' for x in m['controls'] if x['kind']=='port' and x['direction']=='input']
        assert len(inputs)>1
        wire=dict(output_module='2',output_port=output,input_module='3',input_port=inputs[0])
        old_wiring=state['wiring']
        edit('begin',module='2',gesture='parallel-knob')
        send('cable_connect',wiring=old_wiring,**wire)
        edit('update',module='2',gesture='parallel-knob',value=.3)
        edit('end',module='2',gesture='parallel-knob')
        assert len(state['cables'])==1
        cable=state['cables'][0]['id']
        send('cable_connect',ok=False,wiring=old_wiring,**dict(wire,input_port=inputs[1]))
        assert len(state['cables'])==1 and state['cables'][0]['input_port']==inputs[0]
        send('cable_connect',wiring=state['wiring'],replace_cable=cable,**dict(wire,input_port=inputs[1]))
        assert len(state['cables'])==1 and state['cables'][0]['input_port']==inputs[1]
        send('undo');assert state['cables'][0]['input_port']==inputs[0]
        send('redo');assert state['cables'][0]['input_port']==inputs[1]
        cable=state['cables'][0]['id']
        send('cable_disconnect',ok=False,wiring=state['wiring'],cable_id=cable,input_module='3',input_port=inputs[0])
        assert len(state['cables'])==1
        send('cable_disconnect',wiring=state['wiring'],cable_id=cable,input_module='3',input_port=inputs[1])
        assert not state['cables']
        send('undo');assert len(state['cables'])==1
        send('cable_connect',ok=False,wiring=state['wiring'],**dict(wire,output_port=.5))
        send('cable_connect',ok=False,wiring=state['wiring'],**dict(wire,input_module='999'))
        print('PASS: native switches/buttons release, atomic cable connect/move/disconnect, conflict rejection and undo/redo')
        print('PASS: native parameter gestures, canonical values, undo/redo, contention, multiple targets, release and patch epochs')
    finally:
        dll.c3d_destroy(host)
