extends VBoxContainer
## Device routing belongs to the embedded app, independently of old Cardinal settings.
var output_picker: OptionButton
var volume: HSlider
var info: Label
var config := ConfigFile.new()
var settings_path := ""
var refresh_elapsed := 0.0
var backend
var midi_picker: OptionButton
var midi_inputs := PackedStringArray()
var midi_choice := "Off"
var device_controls

func _ready() -> void:
	var user_path := OS.get_environment("CARDINAL_EMBEDDED_USER_DIR")
	if user_path.is_empty(): user_path = ProjectSettings.globalize_path("user://embedded")
	DirAccess.make_dir_recursive_absolute(user_path)
	settings_path = user_path.path_join("audio.cfg")
	config.load(settings_path)
	var heading := Label.new()
	heading.text = "Audio output"
	add_child(heading)
	output_picker = OptionButton.new()
	output_picker.custom_minimum_size = Vector2(380, 42)
	add_child(output_picker)
	var requested := str(config.get_value("audio", "output", "Default"))
	var devices := AudioServer.get_output_device_list()
	AudioServer.output_device = requested if requested in devices else "Default"
	_refresh_devices()
	output_picker.item_selected.connect(func(index: int):
		AudioServer.output_device = output_picker.get_item_text(index)
		config.set_value("audio", "output", AudioServer.output_device)
		_save())
	var volume_label := Label.new()
	volume_label.text = "Output volume"
	add_child(volume_label)
	volume = HSlider.new()
	volume.min_value = 0.0
	volume.max_value = 1.0
	volume.step = 0.01
	volume.custom_minimum_size = Vector2(380, 42)
	volume.value = clampf(float(config.get_value("audio", "volume", 1.0)), 0.0, 1.0)
	add_child(volume)
	_apply_volume(volume.value)
	volume.value_changed.connect(func(value: float):
		_apply_volume(value)
		config.set_value("audio", "volume", value)
		_save())
	info = Label.new()
	add_child(info)
	_refresh_info()
	var midi_label := Label.new()
	midi_label.text = "MIDI input"
	add_child(midi_label)
	midi_picker = OptionButton.new()
	midi_picker.custom_minimum_size = Vector2(380, 42)
	add_child(midi_picker)
	OS.open_midi_inputs()
	midi_inputs = OS.get_connected_midi_inputs()
	midi_picker.add_item("Off")
	midi_picker.add_item("All MIDI inputs")
	for device in midi_inputs: midi_picker.add_item(device)
	midi_choice = str(config.get_value("midi", "input", "Off"))
	if midi_choice != "All MIDI inputs" and midi_choice not in midi_inputs: midi_choice = "Off"
	for index in range(midi_picker.item_count):
		if midi_picker.get_item_text(index) == midi_choice: midi_picker.select(index)
	if midi_choice == "Off": OS.close_midi_inputs()
	midi_picker.item_selected.connect(func(index: int):
		midi_choice = midi_picker.get_item_text(index)
		if backend != null and backend.native != null: backend.native.midi_panic()
		if midi_choice == "Off": OS.close_midi_inputs()
		else:
			OS.open_midi_inputs()
			midi_inputs = OS.get_connected_midi_inputs()
		config.set_value("midi", "input", midi_choice)
		_save())
	var panic := Button.new()
	panic.text = "Release all MIDI notes"
	panic.custom_minimum_size.y = 42
	panic.pressed.connect(func():
		if backend != null and backend.native != null: backend.native.midi_panic())
	add_child(panic)

func _input(event: InputEvent) -> void:
	if not event is InputEventMIDI or midi_choice == "Off" or backend == null or not backend.connected: return
	if midi_choice != "All MIDI inputs":
		if event.device < 0 or event.device >= midi_inputs.size() or midi_inputs[event.device] != midi_choice: return
	var status: int = event.message
	var bytes := PackedByteArray()
	if status >= 0xf8: bytes.append(status)
	elif status >= 0x8 and status <= 0xe:
		bytes.append((status << 4) | (event.channel & 0xf))
		match status:
			0x8, 0x9, 0xa:
				bytes.append(event.pitch & 0x7f)
				bytes.append((event.pressure if status == 0xa else event.velocity) & 0x7f)
			0xb:
				bytes.append(event.controller_number & 0x7f)
				bytes.append(event.controller_value & 0x7f)
			0xc: bytes.append(event.instrument & 0x7f)
			0xd: bytes.append(event.pressure & 0x7f)
			0xe:
				bytes.append(event.pitch & 0x7f)
				bytes.append((event.pitch >> 7) & 0x7f)
	if not bytes.is_empty() and not backend.native.push_midi(bytes): push_error(backend.native.last_error())

func _exit_tree() -> void:
	OS.close_midi_inputs()

func _process(delta: float) -> void:
	refresh_elapsed += delta
	if refresh_elapsed < 2.0: return
	refresh_elapsed = 0.0
	_refresh_devices()
	_refresh_info()

func _apply_volume(value: float) -> void:
	if backend != null and backend.native != null and backend.native.has_method("device_gain"): backend.native.device_gain(value)
	AudioServer.set_bus_volume_db(0, linear_to_db(maxf(value, 0.0001)))
	AudioServer.set_bus_mute(0, value <= 0.0)

func _refresh_devices() -> void:
	var devices := AudioServer.get_output_device_list()
	var current := AudioServer.output_device
	var existing := PackedStringArray()
	for index in range(output_picker.item_count): existing.append(output_picker.get_item_text(index))
	if devices != existing:
		output_picker.clear()
		for device in devices: output_picker.add_item(device)
	for index in range(output_picker.item_count):
		if output_picker.get_item_text(index) == current:
			output_picker.select(index)
			break

func _refresh_info() -> void:
	if backend != null and backend.native != null and backend.native.has_method("device_catalog"):
		if device_controls == null and is_visible_in_tree():
			device_controls = preload("res://scripts/device_audio_controls.gd").new()
			add_child(device_controls)
			move_child(device_controls,0)
			device_controls.setup(backend)
		var state: Variant = JSON.parse_string(backend.native.device_status())
		if state is Dictionary and state.get("running",false):
			info.text = "%d Hz · %d samples (%.1f ms) · %d xruns · input %.3f" % [state.sample_rate,state.buffer_size,float(state.buffer_size)/float(state.sample_rate)*1000.0,state.xruns,state.input_peak]
			var left := float(state.get("input_left_peak",state.get("input_peak",0)))
			var right := float(state.get("input_right_peak",0))
			info.text += "\nInput: %s · L channel %d / R channel %d\nHeld input peak L: %s · R: %s" % [str(state.get("input_device","Unknown")),int(state.get("input_left",-1))+1,int(state.get("input_right",-1))+1,"%.1f dBFS" % linear_to_db(left) if left>0 else "silence","%.1f dBFS" % linear_to_db(right) if right>0 else "silence"]
			if int(state.get("null_inputs",0))>0: info.text += "\nDriver supplied no capture buffer on %d callbacks." % int(state.null_inputs)
			output_picker.disabled = true
			return
	output_picker.disabled = false
	info.text = "%d Hz · output buffer %.1f ms" % [AudioServer.get_mix_rate(), AudioServer.get_output_latency() * 1000.0]
	info.tooltip_text = "Output buffer reported by the audio driver; this does not measure controller or headset latency."

func _save() -> void:
	if config.save(settings_path) != OK: push_error("Could not save embedded audio settings")
