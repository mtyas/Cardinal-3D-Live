# SPDX-License-Identifier: GPL-3.0-or-later
extends VBoxContainer
var backend
var status: Label
var catalog: Array = []
var driver: OptionButton
var input_device: OptionButton
var output_device: OptionButton
var input_left: OptionButton
var input_right: OptionButton
var output_left: OptionButton
var output_right: OptionButton
var rate: OptionButton
var buffer: OptionButton
var saved := {}

func picker(caption: String) -> OptionButton:
	var label := Label.new()
	label.text = caption
	add_child(label)
	var control := OptionButton.new()
	control.custom_minimum_size = Vector2(380,42)
	add_child(control)
	return control

func setup(client) -> void:
	backend = client
	var config := ConfigFile.new()
	config.load(OS.get_environment("CARDINAL_EMBEDDED_USER_DIR").path_join("audio.cfg"))
	saved = config.get_value("device", "settings", {})
	var title := Label.new()
	title.text = "Audio driver & channel routing"
	title.add_theme_font_size_override("font_size",22)
	add_child(title)
	catalog = backend.audio_catalog()
	driver = picker("Driver")
	driver.add_item("Godot · Windows default output", -1)
	driver.set_item_id(0,-1)
	for api: Dictionary in catalog: driver.add_item(str(api.name),int(api.api))
	input_device = picker("Audio input interface (Off disables capture)")
	output_device = picker("Audio output interface")
	input_left = picker("Input → Host Audio left")
	input_right = picker("Input → Host Audio right")
	output_left = picker("Host Audio left → output channel")
	output_right = picker("Host Audio right → output channel")
	rate = picker("DSP sample rate")
	buffer = picker("Requested hardware buffer")
	for frames in [32,64,128,256,512,1024,2048,4096]: buffer.add_item("%d samples" % frames,frames)
	select_id(buffer,int(saved.get("buffer_size",256)))
	select_id(driver,int(saved.get("api",-1)))
	driver.item_selected.connect(func(_index): refresh_devices())
	input_device.item_selected.connect(func(_index): refresh_channels())
	output_device.item_selected.connect(func(_index): refresh_channels())
	refresh_devices()
	var apply := Button.new()
	apply.text = "Apply audio settings & restart"
	apply.custom_minimum_size.y = 48
	add_child(apply)
	apply.pressed.connect(_apply)
	var panel := Button.new()
	panel.text = "Open active ASIO driver control panel"
	panel.custom_minimum_size.y = 42
	add_child(panel)
	panel.pressed.connect(func():
		if not backend.native.device_control_panel(): status.text = "Start ASIO audio first. This panel is supplied by your interface driver.")
	var rescan := Button.new()
	rescan.text = "Rescan interfaces & restart"
	rescan.custom_minimum_size.y = 42
	add_child(rescan)
	rescan.pressed.connect(func():
		if not backend.restart_audio(saved,true): status.text = "Could not restart to rescan audio interfaces.")
	status = Label.new()
	status.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	status.text = "Restart saves a recovery copy of your current patch. Input feeds the Host Audio module; connect its outputs to your patch. A first scan can take a minute with disconnected ASIO interfaces. Rescan after connecting new devices. The driver may negotiate a larger buffer than requested."
	add_child(status)

func select_id(control: OptionButton, id: int) -> void:
	for i in range(control.item_count):
		if control.get_item_id(i) == id:
			control.select(i)
			return

func current_devices() -> Array:
	for api: Dictionary in catalog:
		if int(api.api) == driver.get_selected_id(): return api.devices
	return []

func refresh_devices() -> void:
	input_device.clear()
	input_device.add_item("Off",-1)
	input_device.set_item_id(0,-1)
	output_device.clear()
	for d: Dictionary in current_devices():
		if int(d.inputs)>0: input_device.add_item("%s · %d channels" % [d.name,d.inputs],int(d.id))
		if int(d.outputs)>0:
			output_device.add_item("%s · %d channels" % [d.name,d.outputs],int(d.id))
			if d.default_output: output_device.select(output_device.item_count-1)
	select_id(input_device,int(saved.get("input_device",-1)))
	select_id(output_device,int(saved.get("output_device",-1)))
	for control in [input_device,output_device,input_left,input_right,output_left,output_right,rate,buffer]: control.disabled = driver.get_selected_id() < 0
	refresh_channels()

func refresh_channels() -> void:
	var ins := 0
	var outs := 0
	var rates: Array = []
	var input_rates: Array = []
	for d: Dictionary in current_devices():
		if int(d.id) == input_device.get_selected_id():
			ins=int(d.inputs)
			input_rates=d.rates
		if int(d.id) == output_device.get_selected_id():
			outs=int(d.outputs)
			rates=d.rates
	for control in [input_left,input_right]:
		control.clear()
		control.add_item("Off",-1)
		control.set_item_id(0,-1)
		for channel in range(ins): control.add_item("Channel %d" % (channel+1),channel)
	for control in [output_left,output_right]:
		control.clear()
		for channel in range(outs): control.add_item("Channel %d" % (channel+1),channel)
	select_id(input_left,int(saved.get("input_left",0)))
	select_id(input_right,int(saved.get("input_right",mini(1,ins-1))))
	select_id(output_left,int(saved.get("output_left",0)))
	select_id(output_right,int(saved.get("output_right",mini(1,outs-1))))
	rate.clear()
	for hz in rates:
		if int(hz)>=8000 and int(hz)<=192000 and (ins==0 or hz in input_rates): rate.add_item("%d Hz" % hz,int(hz))
	select_id(rate,int(saved.get("sample_rate",48000)))

func _apply() -> void:
	var settings := {}
	if driver.get_selected_id()>=0:
		if output_device.item_count==0 or rate.item_count==0:
			status.text = "Choose an available output interface and sample rate."
			return
		settings={"api":driver.get_selected_id(),"input_device":input_device.get_selected_id(),"output_device":output_device.get_selected_id(),"input_left":input_left.get_selected_id(),"input_right":input_right.get_selected_id(),"output_left":output_left.get_selected_id(),"output_right":output_right.get_selected_id(),"sample_rate":rate.get_selected_id(),"buffer_size":buffer.get_selected_id()}
		if settings.api == 7 and settings.input_device >= 0 and settings.input_device != settings.output_device:
			status.text = "ASIO requires the same interface for input and output."
			return
		if settings.input_device >= 0 and maxi(settings.input_left,settings.input_right)<0:
			status.text = "Select an input channel, or set the input interface to Off."
			return
	if not backend.restart_audio(settings): status.text = "Could not save recovery or restart. Your current patch remains open."
