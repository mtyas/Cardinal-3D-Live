# SPDX-License-Identifier: GPL-3.0-or-later
extends Node3D
## Audio publishing has its own worker; widgets and networking never run in DSP.
var host
var peer = preload("res://scripts/show_transport.gd").new()
var publishing := false
var elapsed := 0.0
var status: Label
var live_button: Button
var live_buttons: Array[Button] = []
var session_name: LineEdit
var session_title := "Live session"
var live_state := ""
var broadcast_button: Button
var invite_button: Button
var visitor_button: Button
var status_notice_until := 0
var fixtures := {}
var latest := {}
var quality: OptionButton
var public_show := false
var spatial_monitoring := false
var audience=preload("res://scripts/show_audience.gd").new()
var visuals = preload("res://scripts/show_visuals.gd").new()
var visual_elapsed := 1.0
var visual_state := {}
var visual_control_epoch := ""
var visual_wiring := ""
var visual_control_revision := -1
var fixture_guides := true
var visitor_address := "http://localhost:8778/"
var controls = preload("res://scripts/show_controls.gd").new()

func setup(owner_host, column: VBoxContainer) -> void:
	host = owner_host
	add_child(audience)
	var ui = preload("res://scripts/ui_theme.gd")
	status = Label.new()
	status.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	status.text = "Ready to broadcast. Your patch stays on this computer."
	status.add_theme_color_override("font_color", Color("a4edcf"))
	column.add_child(status)
	var name_label := Label.new()
	name_label.text = "Session name · displayed on the shared boards"
	column.add_child(name_label)
	session_name = LineEdit.new()
	session_name.max_length = 80
	session_name.placeholder_text = "Name your performance"
	var naming := ConfigFile.new()
	var naming_path := OS.get_environment("CARDINAL_EMBEDDED_USER_DIR").path_join("live-session.cfg")
	naming.load(naming_path)
	session_title = str(naming.get_value("session", "title", "Live session"))
	session_name.text = session_title
	session_name.text_changed.connect(func(value: String):
		if not publishing:
			session_title = value.strip_edges()
			naming.set_value("session", "title", session_title)
			naming.save(naming_path))
	column.add_child(session_name)
	broadcast_button = Button.new()
	broadcast_button.text = "Go live"
	broadcast_button.theme_type_variation = "PrimaryButton"
	broadcast_button.custom_minimum_size.y = 46
	broadcast_button.pressed.connect(_toggle)
	column.add_child(broadcast_button)
	var links := HBoxContainer.new()
	column.add_child(links)
	invite_button = Button.new()
	invite_button.text = "Copy invitation"
	invite_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	invite_button.pressed.connect(func(): DisplayServer.clipboard_set(visitor_address); status.text = "Invitation copied. Share it with your guests."; status_notice_until = Time.get_ticks_msec() + 2500)
	links.add_child(invite_button)
	visitor_button = Button.new()
	visitor_button.text = "Open visitor view"
	visitor_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	visitor_button.pressed.connect(func(): OS.shell_open(visitor_address))
	links.add_child(visitor_button)
	var public_switch := CheckButton.new()
	public_switch.text = "List this performance on the public homepage"
	public_switch.toggled.connect(func(enabled: bool): public_show=enabled)
	column.add_child(public_switch)
	var privacy := Label.new()
	privacy.text = "Off: guests need your invitation. On: anyone can join as a visitor."
	privacy.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	privacy.add_theme_font_size_override("font_size", 14)
	column.add_child(privacy)
	var collaboration: VBoxContainer = ui.section(column, "Collaborators", true)
	controls.setup(host.bridge, collaboration)
	var chat_column: VBoxContainer = ui.section(column, "Audience & chat", false)
	audience.setup(host, chat_column, peer)
	var tools: VBoxContainer = ui.section(column, "Add to the stage", false)
	var hint := Label.new()
	hint.text = "Connect audio to Show Speakers and CV to Show Lights. Use their module controls to place them in the world."
	hint.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	hint.add_theme_font_size_override("font_size", 14)
	tools.add_child(hint)
	var grid := GridContainer.new()
	grid.columns = 2
	tools.add_child(grid)
	for entry in [["Chat board", "ShowChatBoard"], ["Spatial speaker", "ShowSpeaker"], ["CV light", "ShowLight"], ["Dancing figure", "ShowFigure"], ["Fountain", "ShowFountain"], ["Particles", "ShowParticles"], ["Kinetic sculpture", "ShowSculpture"]]:
		var button := Button.new()
		button.text = entry[0]
		button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		button.pressed.connect(func(): host.bridge.send_command("add", {"plugin":"Cardinal3DShow", "model":entry[1]}))
		grid.add_child(button)
	var guides := CheckButton.new()
	guides.text = "Show light aiming guides"
	guides.button_pressed = true
	guides.toggled.connect(func(enabled: bool): fixture_guides=enabled)
	tools.add_child(guides)
	var options: VBoxContainer = ui.section(column, "Stream & monitoring options", false)
	var audio_config := ConfigFile.new()
	var audio_path := OS.get_environment("CARDINAL_EMBEDDED_USER_DIR").path_join("audio.cfg")
	audio_config.load(audio_path)
	spatial_monitoring=bool(audio_config.get_value("audio","spatial_monitor",OS.get_environment("CARDINAL_3D_XR")=="1" and OS.get_environment("CARDINAL_SHOW_AUTO_START")=="1"))
	var monitor := CheckButton.new()
	monitor.text = "Spatial headphone monitoring"
	monitor.tooltip_text = "Monitor Show Speakers from your position in the stage."
	monitor.button_pressed=spatial_monitoring
	monitor.toggled.connect(func(enabled): spatial_monitoring=enabled;audio_config.set_value("audio","spatial_monitor",enabled);audio_config.save(audio_path))
	options.add_child(monitor)
	var label := Label.new()
	label.text = "Maximum visitor audio quality"
	options.add_child(label)
	quality = OptionButton.new()
	for choice in ["Standard · 64 kb/s per source", "High · 96 kb/s per source", "Maximum · 128 kb/s per source"]: quality.add_item(choice)
	quality.select(2)
	var preferences_path := OS.get_environment("CARDINAL_EMBEDDED_USER_DIR").path_join("show-preferences.json")
	if FileAccess.file_exists(preferences_path):
		var preferences: Variant = JSON.parse_string(FileAccess.get_file_as_string(preferences_path))
		if preferences is Dictionary: quality.select(clampi(int(preferences.get("quality", 2)),0,2))
	quality.item_selected.connect(func(index: int):
		var file := FileAccess.open(preferences_path, FileAccess.WRITE)
		if file != null: file.store_string(JSON.stringify({"quality":index})))
	options.add_child(quality)
	var notice := Label.new()
	notice.text = "Guests choose their listening quality up to this limit. WebRTC carries real-time audio."
	notice.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	notice.add_theme_font_size_override("font_size", 14)
	options.add_child(notice)
	if host.bridge.has_signal("stopping"): host.bridge.stopping.connect(func(): controls.stop();peer.close())
	if OS.get_environment("CARDINAL_SHOW_AUTO_START") == "1": _toggle.call_deferred()

func register_live_button(button: Button) -> void:
	live_buttons.append(button)
	live_state = ""

func open_live() -> void:
	host.show_settings("show")
	if not publishing: session_name.grab_focus(); session_name.select_all()

func _toggle() -> void:
	if publishing:
		controls.stop()
		peer.close()
		publishing = false
		audience.receive({})
		status.text = "Broadcast stopped · your patch keeps playing."
		return
	session_title = session_name.text.strip_edges()
	if session_title.is_empty():
		status.text = "Give this session a name before going live."
		open_live()
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
	var caption := "End live session" if publishing else "Go live"
	if broadcast_button.text != caption: broadcast_button.text = caption
	var connected := publishing and peer.get_ready_state() == WebSocketPeer.STATE_OPEN
	session_name.editable = not publishing
	var next_state := "live" if connected and host.bridge.connected else ("connecting" if publishing else "offline")
	if next_state != live_state:
		live_state = next_state
		for button in live_buttons:
			button.text = {"live":"● LIVE", "connecting":"Connecting…", "offline":"Live"}[live_state]
			button.tooltip_text = "Live session settings" if connected else "Name your session and go live"
			button.theme_type_variation = "LiveButton" if live_state == "live" else "Button"
	invite_button.disabled = not connected
	visitor_button.disabled = not connected
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
	controls.tick(peer,peer.room_snapshot(),publishing and peer.get_ready_state()==WebSocketPeer.STATE_OPEN)
	if elapsed >= 1.0 / 30.0:
		elapsed = 0.0
		var data: Variant = JSON.parse_string(native.show_json())
		if data is Dictionary:
			data["session_title"] = session_title
			latest = data
			_update_fixtures(data)
			if publishing and peer.get_ready_state() == WebSocketPeer.STATE_OPEN:
				var control_epoch: String=controls.policy.epoch if controls.enabled and controls.ready else ""
				var control_revision: int=controls.policy.revision if controls.enabled else 0
				var capture_visuals: bool=visual_elapsed >= .2 or visual_control_epoch!=control_epoch or visual_control_revision!=control_revision or visual_wiring!=str(host.snapshot.get("wiring", ""))
				if capture_visuals:
					visual_elapsed=0.0
					visual_state=visuals.capture(host,peer)
					visual_wiring=str(host.snapshot.get("wiring", ""))
					visual_control_epoch=control_epoch
					visual_control_revision=control_revision
				if capture_visuals: data["visuals"] = visual_state
				if host.bridge.has_method("take_visual_values"):data["visual_values"]=host.bridge.take_visual_values()
				data["wiring"] = visual_wiring
				data["control_epoch"] = control_epoch
				data["control_revision"] = visual_control_revision
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
				if Time.get_ticks_msec() >= status_notice_until:
					status.text = "Broadcasting · %d %s · %d %s" % [data.speakers.size(), "speaker" if data.speakers.size()==1 else "speakers", data.lights.size(), "light" if data.lights.size()==1 else "lights"]
	# Offline UI draining prevents old samples from replaying on the next start.
	if not publishing: native.show_audio_network()

func _exit_tree() -> void:
	controls.stop()
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
		fixtures[id].apply_state(board,audience.room.get("chat",[]),session_title)
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
