extends Node3D
## Desktop input adapter for the same rack layout used by VR.
var host
var spatial: Node3D
var case_body: StaticBody3D
var headset: Camera3D
var selected_module := {}
var module_picker: OptionButton
var layout
var fields := []
var module_signature := ""

func setup(owner_host) -> void:
	host = owner_host
	headset = host.camera
	spatial = Node3D.new()
	add_child(spatial)
	for node in [host.rack, host.rack_case, host.cables, host.pending_wire]: node.reparent(spatial, false)
	case_body = StaticBody3D.new()
	var collision := CollisionShape3D.new()
	collision.shape = BoxShape3D.new()
	case_body.add_child(collision)
	spatial.add_child(case_body)
	layout = preload("res://scripts/rack_layout.gd").new()
	add_child(layout)
	host.rack_layout = layout
	layout.setup(self)
	host.bridge.message_received.connect(func(message: Dictionary):
		if message.get("type") == "snapshot": refresh_modules.call_deferred())

func cancel() -> void:
	host._release()
	host._clear_focus()

func _valid_selection() -> bool:
	return is_instance_valid(selected_module.get("view")) and host.modules.has(str(selected_module.view.descriptor.id))

func select_view(view) -> void:
	selected_module = {"view": view}
	refresh_modules()
	for index in range(module_picker.item_count):
		if module_picker.get_item_metadata(index) == str(view.descriptor.id): module_picker.select(index)

func refresh_modules() -> void:
	var names := []
	for id in host.modules: names.append([id, str(host.modules[id].descriptor.get("name", id))])
	var signature := JSON.stringify(names)
	if signature == module_signature: return
	module_signature = signature
	var previous: String = str(selected_module.view.descriptor.id) if _valid_selection() else ""
	module_picker.clear()
	for entry in names:
		module_picker.add_item(entry[1] + " · " + entry[0])
		module_picker.set_item_metadata(module_picker.item_count - 1, entry[0])
		if entry[0] == previous: module_picker.select(module_picker.item_count - 1)
	_choose_module(module_picker.selected)

func _choose_module(index: int) -> void:
	selected_module.clear()
	if index >= 0:
		var id: String = module_picker.get_item_metadata(index)
		if host.modules.has(id): selected_module = {"view": host.modules[id]}

func build_layout_controls(column: VBoxContainer) -> void:
	var label := Label.new()
	label.text = "Module to move into the selected rack"
	column.add_child(label)
	module_picker = OptionButton.new()
	module_picker.fit_to_longest_item = false
	module_picker.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	module_picker.item_selected.connect(_choose_module)
	column.add_child(module_picker)
	var pose_title := Label.new()
	pose_title.text = "Selected rack · position & rotation"
	column.add_child(pose_title)
	var grid := GridContainer.new()
	grid.columns = 3
	column.add_child(grid)
	for axis in ["X · left/right", "Y · height", "Z · depth", "Tilt · X", "Turn · Y", "Roll · Z"]:
		var cell := VBoxContainer.new()
		cell.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		grid.add_child(cell)
		var name_label := Label.new()
		name_label.text = axis
		name_label.add_theme_font_size_override("font_size", 13)
		cell.add_child(name_label)
		var field := SpinBox.new()
		var index := fields.size()
		field.min_value = -20 if index < 3 else -180
		field.max_value = 20 if index < 3 else 180
		field.step = .05 if index < 3 else 5
		field.suffix = "m" if index < 3 else "°"
		field.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		field.value_changed.connect(func(_value: float): _apply_pose())
		cell.add_child(field)
		fields.append(field)
	layout.picker.item_selected.connect(func(_index: int): refresh_layout_controls())
	layout.mode_button.toggled.connect(func(_enabled: bool): refresh_layout_controls())
	refresh_layout_controls()

func refresh_layout_controls() -> void:
	if fields.size() != 6 or layout.cases.is_empty(): return
	var cabinet: Node3D = layout.cases[layout.active_case].root
	var pose := [cabinet.position.x, cabinet.position.y, cabinet.position.z, cabinet.rotation_degrees.x, cabinet.rotation_degrees.y, cabinet.rotation_degrees.z]
	for index in range(6):
		fields[index].set_value_no_signal(pose[index])
		fields[index].editable = layout.layout_mode
	module_picker.disabled = not layout.layout_mode

func _apply_pose() -> void:
	if not layout.layout_mode: return
	var cabinet: Node3D = layout.cases[layout.active_case].root
	cabinet.position = Vector3(fields[0].value, fields[1].value, fields[2].value)
	cabinet.rotation_degrees = Vector3(fields[3].value, fields[4].value, fields[5].value)
	layout.sync()
	layout.save()
