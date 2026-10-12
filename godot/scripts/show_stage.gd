# SPDX-License-Identifier: GPL-3.0-or-later
extends Node3D
## Audio publishing has its own worker; widgets and networking never run in DSP.
var host
var peer = preload("res://scripts/show_transport.gd").new()
var publishing := false
var elapsed := 0.0
var status: Label
var fixtures := {}
var latest := {}
var quality: OptionButton
var public_show := false
var spatial_monitoring := false
var audience=preload("res://scripts/show_audience.gd").new()
var visuals = preload("res://scripts/show_visuals.gd").new()
var visual_elapsed := 1.0
var visual_state := {}
var fixture_guides := true
var visitor_address := "http://localhost:8778/"

func setup(owner_host, column: VBoxContainer) -> void:
	host = owner_host
	add_child(audience)
	audience.setup(host,column,peer)
	var audio_config := ConfigFile.new()
	var audio_path := OS.get_environment("CARDINAL_EMBEDDED_USER_DIR").path_join("audio.cfg")
	audio_config.load(audio_path)
	spatial_monitoring=bool(audio_config.get_value("audio","spatial_monitor",OS.get_environment("CARDINAL_3D_XR")=="1" and OS.get_environment("CARDINAL_SHOW_AUTO_START")=="1"))
	var monitor := CheckButton.new();monitor.text="Spatial headphone monitoring · Show Speakers only";monitor.button_pressed=spatial_monitoring
	monitor.toggled.connect(func(enabled): spatial_monitoring=enabled;audio_config.set_value("audio","spatial_monitor",enabled);audio_config.save(audio_path))
	column.add_child(monitor)
	if host.bridge.has_signal("stopping"): host.bridge.stopping.connect(func(): peer.close())
	var title := Label.new()
	title.text = "Your live stage"
	title.add_theme_font_size_override("font_size", 25)
	column.add_child(title)
	status = Label.new()
	status.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	status.text = "Local test · start the Show web preview, then broadcast."
	column.add_child(status)
	var hint := Label.new()
	hint.text = "Add Show Speaker modules and connect audio to their inputs.\nAdd Show Light modules for CV-controlled stage lighting.\nPosition and direction are set by each module's knobs."
	hint.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	column.add_child(hint)
	for entry in [["Add a shared chat board", "ShowChatBoard"], ["Add a spatial speaker", "ShowSpeaker"], ["Add a CV light", "ShowLight"], ["Add a dancing figure", "ShowFigure"], ["Add a synchronized fountain", "ShowFountain"], ["Add a particle emitter", "ShowParticles"], ["Add a kinetic sculpture", "ShowSculpture"]]:
		var button := Button.new()
		button.text = entry[0]
		button.pressed.connect(func(): host.bridge.send_command("add", {"plugin":"Cardinal3DShow", "model":entry[1]}))
		column.add_child(button)
	var start := Button.new()
	start.text = "Start / stop broadcasting"
	start.pressed.connect(_toggle)
	column.add_child(start)
	var public_switch := CheckButton.new()
	public_switch.text = "Public show · anyone can enter from the homepage"
	public_switch.toggled.connect(func(enabled: bool): public_show=enabled)
	column.add_child(public_switch)
	var browser := Button.new()
	browser.text = "Open visitor page"
	browser.pressed.connect(func(): OS.shell_open(visitor_address))
	column.add_child(browser)
	var invite := Button.new()
	invite.text="Copy visitor invitation link"
	invite.pressed.connect(func(): DisplayServer.clipboard_set(visitor_address);status.text="Visitor invitation copied · share this link with your guests.")
	column.add_child(invite)
	var guides := CheckButton.new()
	guides.text = "Light fixture aiming guides"
	guides.button_pressed = true
	guides.toggled.connect(func(enabled: bool): fixture_guides=enabled)
	column.add_child(guides)
	var label := Label.new()
	label.text = "Maximum visitor audio quality (compressed transport)"
	column.add_child(label)
	quality = OptionButton.new()
	for choice in ["Standard · 64 kb/s per mono source", "High · 96 kb/s per mono source", "Maximum · 128 kb/s per mono source"]: quality.add_item(choice)
	quality.select(2)
	var preferences_path := OS.get_environment("CARDINAL_EMBEDDED_USER_DIR").path_join("show-preferences.json")
	if FileAccess.file_exists(preferences_path):
		var preferences: Variant = JSON.parse_string(FileAccess.get_file_as_string(preferences_path))
		if preferences is Dictionary: quality.select(clampi(int(preferences.get("quality", 2)),0,2))
	quality.item_selected.connect(func(index: int):
		var file := FileAccess.open(preferences_path, FileAccess.WRITE)
		if file != null: file.store_string(JSON.stringify({"quality":index}))
	)
	column.add_child(quality)
	var notice := Label.new()
	notice.text = "Visitors receive Opus at their chosen quality, up to this ceiling.\nBrowsers without Opus decoding use PCM for local testing."
	notice.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	column.add_child(notice)
	if OS.get_environment("CARDINAL_SHOW_AUTO_START") == "1": _toggle.call_deferred()

func _toggle() -> void:
	if publishing:
		peer.close()
		publishing = false
		audience.receive({})
		status.text = "Broadcast stopped · your patch keeps playing."
		return
	var path := OS.get_environment("CARDINAL_SHOW_SESSION")
	if not FileAccess.file_exists(path):
		status.text = "Start Launch Show web preview.bat first, then try broadcasting again."
		return
	var config: Variant = JSON.parse_string(FileAccess.get_file_as_string(path))
	if not config is Dictionary or not str(config.get("url", "")).begins_with("ws://127.0.0.1:"):
		status.text = "The local room address is missing. Restart its launcher."
		return
	visitor_address = str(config.get("visitor_url","http://localhost:8778/"))
	peer.close()
	peer = preload("res://scripts/show_transport.gd").new()
	visuals = preload("res://scripts/show_visuals.gd").new()
	audience.peer=peer
	var error: int = peer.connect_to_url(config.url)
	publishing = error == OK
	status.text = "Connecting to the visitor room…" if publishing else "Could not connect to the visitor room."

func _process(delta: float) -> void:
	if host == null or not host.bridge.connected or OS.get_environment("CARDINAL_3D_EMBEDDED") != "1": return
	var native = host.bridge.native
	if native == null or not native.has_method("show_json"): return
	if native.has_method("spatial_monitor"):
		var camera: Camera3D=host.xr_session.headset if host.xr_session!=null and host.xr_session.headset!=null else host.camera
		var position: Vector3=camera.global_position
		if OS.get_environment("CARDINAL_3D_XR")!="1": position.y+=1.5
		native.spatial_monitor(spatial_monitoring,position,camera.global_basis.x)
	elapsed += delta
	visual_elapsed += delta
	if publishing:
		peer.start(native)
		audience.receive(peer.room_snapshot())
		if peer.get_ready_state() == WebSocketPeer.STATE_CLOSED:
			publishing = false
			status.text = "Room disconnected. Close any performer preview tab and start broadcasting again."
	if elapsed >= 1.0 / 30.0:
		elapsed = 0.0
		var data: Variant = JSON.parse_string(native.show_json())
		if data is Dictionary:
			latest = data
			_update_fixtures(data)
			if publishing and peer.get_ready_state() == WebSocketPeer.STATE_OPEN:
				if visual_elapsed >= 0.05:
					visual_elapsed=0.0
					visual_state=visuals.capture(host,peer)
				data["visuals"] = visual_state
				var desktop_head: Vector3 = host.camera.global_position + Vector3(0,1.5,0)
				data["performer_pose"]={"position":[desktop_head.x,desktop_head.y,desktop_head.z],"yaw":host.camera.global_rotation.y+PI}
				if host.xr_session != null and host.xr_session.headset != null:
					var head: XRCamera3D = host.xr_session.headset
					data["performer_pose"]={"position":[head.global_position.x,head.global_position.y,head.global_position.z],"yaw":head.global_rotation.y+PI}
				data["performer_hands"] = host.xr_session.broadcast_hands() if host.xr_session != null else {}
				data["type"] = "show"
				data["public_show"] = public_show
				data["max_audio_kbps"] = [64,96,128][quality.selected]
				if peer.get_current_outbound_buffered_amount() < 65536: peer.send_text(JSON.stringify(data))
				status.text = "LIVE · %d speakers · %d lights · Opus audience audio" % [data.speakers.size(),data.lights.size()]
	# Offline UI draining prevents old samples from replaying on the next start.
	if not publishing: native.show_audio_network()

func _exit_tree() -> void:
	peer.close()

func _update_fixtures(data: Dictionary) -> void:
	var present := {}
	for speaker: Dictionary in data.speakers:
		var id := "speaker/" + str(speaker.id)
		present[id] = true
		if not fixtures.has(id):
			var box=preload("res://scripts/show_speaker.gd").new()
			add_child(box)
			fixtures[id]=box
		fixtures[id].position = Vector3(speaker.position[0],speaker.position[1],speaker.position[2])
		if OS.get_environment("CARDINAL_3D_XR")!="1": fixtures[id].position.y-=1.5
		fixtures[id].rotation.y = deg_to_rad(float(speaker.yaw))
	for fixture: Dictionary in data.lights:
		var id := "light/" + str(fixture.id)
		present[id] = true
		if not fixtures.has(id):
			var prop = preload("res://scripts/show_fixture.gd").new()
			add_child(prop)
			fixtures[id] = prop
		var v: Array = fixture.values
		var prop = fixtures[id]
		var light: SpotLight3D = prop.light
		prop.update_color(Color(v[1],v[2],v[3]))
		prop.guide.visible=fixture_guides
		prop.position = Vector3(v[5],v[6],v[7])
		if OS.get_environment("CARDINAL_3D_XR")!="1": prop.position.y-=1.5
		prop.rotation_degrees = Vector3(-45.0,float(v[8])+180.0,0.0)
		light.light_color = Color(v[1],v[2],v[3])
		light.light_energy = float(v[0])*4.0
		light.spot_angle = clampf(float(v[4])*0.5,2.5,80.0)
	for board: Dictionary in data.get("boards",[]):
		var id := "board/"+str(board.id)
		present[id]=true
		if not fixtures.has(id):
			var prop=preload("res://scripts/show_chat_board.gd").new();add_child(prop);fixtures[id]=prop
		fixtures[id].apply_state(board,audience.room.get("chat",[]))
		if OS.get_environment("CARDINAL_3D_XR")!="1": fixtures[id].position.y-=1.5
	for object: Dictionary in data.get("objects",[]):
		var id := "object/"+str(object.id)
		present[id]=true
		if not fixtures.has(id):
			var prop=preload("res://scripts/show_object.gd").new()
			prop.kind=str(object.kind);add_child(prop);fixtures[id]=prop
		fixtures[id].apply_state(object)
		if OS.get_environment("CARDINAL_3D_XR")!="1": fixtures[id].position.y-=1.5
	for id: String in fixtures.keys():
		if not present.has(id):
			fixtures[id].queue_free()
			fixtures.erase(id)
