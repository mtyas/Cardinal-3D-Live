extends SceneTree
class BridgeFixture extends RefCounted:
	signal local_interaction(operation: String, data: Dictionary)
	var native
	var connected := true
	var generation := ""
	var state := {}
	func _ingest(raw: String) -> void:
		for message in JSON.parse_string(raw):
			if message.type == "parameter_value":
				for module in state.get("modules", []):
					if module.id!=message.module:continue
					for control in module.controls:
						if control.kind in ["knob","slider","switch"] and control.id==message.param:control.normalized=message.value
			if message.type == "snapshot":
				state = message
				generation = message.generation
class PeerFixture extends RefCounted:
	var sent := []
	var events := []
	var closed := false
	func send_command_text(text: String) -> bool:
		sent.append(JSON.parse_string(text));return true
	func take_control_events() -> Array:
		var result=events;events=[];return result
	func close() -> void: closed=true
func _initialize() -> void: call_deferred("run")
func run() -> void:
	var bridge := BridgeFixture.new()
	bridge.native = ClassDB.instantiate("CardinalEmbeddedHost")
	var directory := OS.get_environment("CARDINAL_EMBEDDED_USER_DIR")
	assert(bridge.native.initialize(OS.get_environment("CARDINAL_EMBEDDED_RESOURCES"), directory, 48000, 256))
	var path := directory.path_join("control-test.vcv")
	var file := FileAccess.open(path, FileAccess.WRITE)
	file.store_string(JSON.stringify({"version":"2.4.1", "modules":[{"id":1,"plugin":"Fundamental","model":"VCO","pos":[0,0],"params":[]},{"id":2,"plugin":"Fundamental","model":"SEQ3","pos":[15,0],"params":[]}],"cables":[]}))
	file.close()
	assert(bridge.native.load_patch(path))
	bridge._ingest(bridge.native.messages_json('{"op":"hello","version":1,"request":0}'))
	var adapter = load("res://scripts/control_native_adapter.gd").new(bridge)
	var policy = load("res://scripts/control_authority.gd").new(func(): return Time.get_ticks_msec(), func(_m, _p): return true, adapter.apply, adapter.begin, adapter.end, adapter.cable)
	policy.reset(bridge.generation)
	assert(policy.grant("remote"))
	var parameter := -1
	for control in bridge.state.modules[0].controls:
		if control.kind == "knob":
			parameter = int(control.id)
			break
	assert(parameter >= 0)
	var command := {"epoch":policy.epoch,"sequence":1,"action":"begin","module":"1","parameter":parameter}
	var granted: Dictionary = policy.handle("remote", command)
	assert(granted.ok)
	command.merge({"sequence":2,"action":"update","lease":granted.lease,"value":0.7}, true)
	var updated: Dictionary = policy.handle("remote", command)
	assert(updated.ok and updated.revision == 1 and is_equal_approx(updated.value, 0.7))
	policy.revoke("remote")
	assert(adapter.gestures.is_empty(), "Disconnect must finalize the native undo gesture")
	var production_bridge=load("res://scripts/embedded_client.gd").new()
	production_bridge.native=bridge.native;production_bridge.connected=true;production_bridge.generation=bridge.generation
	production_bridge.local_snapshot=bridge.state
	var compact_adapter=load("res://scripts/control_native_adapter.gd").new(production_bridge)
	assert(compact_adapter.begin("1",parameter,"cache-test"))
	assert(is_equal_approx(compact_adapter.apply("1",parameter,0.45),0.45))
	var fresh := false
	for control in bridge.state.modules[0].controls:
		if control.kind=="knob" and int(control.id)==parameter:fresh=is_equal_approx(control.normalized,0.45)
	assert(fresh and production_bridge.snapshot_count==0,"Compact reply must update shared visual descriptors without a full scene snapshot")
	compact_adapter.end("1",parameter,"cache-test")
	production_bridge.free()

	assert(policy.grant("remote"))
	command.merge({"sequence":3,"action":"begin"}, true)
	assert(policy.handle("remote", command).ok)
	policy.local_grab("1", parameter)
	assert(adapter.gestures.is_empty(), "Local priority must finalize the remote gesture")
	assert(not policy.handle("remote", command).ok)
	var column := VBoxContainer.new();root.add_child(column)
	var controls = load("res://scripts/show_controls.gd").new()
	controls.setup(bridge,column)
	var peer := PeerFixture.new()
	var room := {"members":[{"id":"guest","name":"Remote test","role":"visitor"}]}
	column.get_child(0).button_pressed=true
	controls.tick(peer,room,true)
	var epoch: String=controls.policy.epoch
	peer.events=[{"type":"control_session","epoch":epoch}];controls.tick(peer,room,true)
	column.get_child(2).pressed.emit()
	assert(peer.sent.back().type=="control_grant" and peer.sent.back().actor=="guest")
	peer.events=[{"type":"control_permission","actor":"guest","grant":"permission","enabled":true,"epoch":epoch}]
	controls.tick(peer,room,true)
	var action := {"type":"control_action","actor":"guest","grant":"permission","epoch":epoch,"sequence":1,"action":"begin","module":"1","parameter":parameter}
	peer.events=[action.duplicate()];controls.tick(peer,room,true)
	var ack: Dictionary=peer.sent.back();assert(ack.ok and ack.type=="control_result")
	action.merge({"sequence":2,"action":"update","lease":ack.lease,"value":0.3},true)
	peer.events=[action.duplicate()];controls.tick(peer,room,true)
	assert(peer.sent.back().ok and is_equal_approx(peer.sent.back().value,0.3))
	var burst_a: Dictionary=action.duplicate();burst_a.sequence=3;burst_a.value=0.35
	var burst_b: Dictionary=action.duplicate();burst_b.sequence=4;burst_b.value=0.4
	peer.events=[burst_a,burst_b];controls.tick(peer,room,true)
	assert(peer.sent.back().ok and peer.sent.back().sequence==3 and controls.pending_actions.size()==1)
	controls.tick(peer,room,true)
	assert(peer.sent.back().ok and peer.sent.back().sequence==4 and controls.pending_actions.is_empty())

	bridge.local_interaction.emit("pointer",{"phase":"down"})
	assert(controls.adapter.gestures.is_empty())
	action.sequence=5;peer.events=[action.duplicate()];controls.tick(peer,room,true)
	assert(peer.sent.back().reason=="host_busy")
	bridge.local_interaction.emit("release",{})
	column.get_child(3).pressed.emit()
	assert(controls.grants.is_empty() and peer.sent.back().type=="control_revoke")
	peer.events=[{"type":"control_permission","actor":"guest","grant":"late","enabled":true,"epoch":epoch}]
	controls.tick(peer,room,true)
	assert(controls.grants.is_empty() and peer.sent.back().type=="control_revoke", "A late grant acknowledgment must not override local revocation")
	controls.stop()
	var session_path := OS.get_environment("CARDINAL_CONTROL_TEST_SESSION")
	if not session_path.is_empty():
		var session: Dictionary=JSON.parse_string(FileAccess.get_file_as_string(session_path))
		var transport=load("res://scripts/show_transport.gd").new()
		transport.connect_to_url(session.url);transport.start(bridge.native)
		var granted_live := false
		var changed_live := false
		var finished_live := false
		var last_publish := 0
		var deadline := Time.get_ticks_msec()+15000
		while Time.get_ticks_msec()<deadline:
			await process_frame
			var live_room: Dictionary=transport.room_snapshot()
			controls.tick(transport,live_room,transport.get_ready_state()==WebSocketPeer.STATE_OPEN)
			if controls.ready and controls.selection.item_count>0 and not granted_live:
				column.get_child(2).pressed.emit();granted_live=true
			if controls.ready and Time.get_ticks_msec()-last_publish>=50:
				last_publish=Time.get_ticks_msec()
				var panels := []
				for module in bridge.state.modules:
					panels.append({"id":module.id,"name":module.name,"controls":module.controls,"width":0.5,"height":0.76,"texture":"","matrix":[1,0,0,0,0,1,0,0,0,0,1,0,0,1,0,1]})
				var cables := []
				for cable in bridge.state.cables:
					var entry: Dictionary=cable.duplicate();entry["a"]=[0,1,0];entry["b"]=[1,1,0];cables.append(entry)
				transport.send_text(JSON.stringify({"type":"show","frame":last_publish*48,"sample_rate":48000,"speakers":[],"lights":[],"control_epoch":controls.policy.epoch,"control_revision":controls.policy.revision,"wiring":bridge.state.wiring,"visuals":{"panels":panels,"cables":cables,"environment":"","hour":14,"place":0}}))
			if granted_live and controls.ready and controls.policy.revision>0:changed_live=true
			if changed_live and controls.grants.is_empty():finished_live=true;break
		print("Control network check: granted=%s changed=%s finished=%s ready=%s socket=%s visitors=%s" % [granted_live,changed_live,finished_live,controls.ready,transport.get_ready_state(),controls.selection.item_count])
		controls.stop();transport.close()
		if not (granted_live and changed_live and finished_live):
			bridge.native.close();push_error("Real remote client must edit and disconnect cleanly");quit(1);return
		for module in bridge.state.modules:
			for control in module.controls:
				if control.kind=="switch" and control.get("momentary",false): assert(is_zero_approx(control.normalized), "Disconnected performer must not leave a button pressed")
		assert(bridge.state.cables.is_empty(), "Probe must finish with disconnected cables")
		print("PASS: real WebSocket visitor to relay to Godot worker to host policy to native parameter")
	column.queue_free()
	bridge.native.close()
	print("PASS: host policy to Godot adapter to native engine, canonical acknowledgment and gesture cleanup")
	quit()
