extends SceneTree
var failures := 0
func check(condition: bool, message: String) -> void:
	if not condition:
		failures += 1
		push_error(message)
func _initialize() -> void: call_deferred("run")
func key(code: int, pressed: bool) -> void:
	var event := InputEventKey.new()
	event.keycode = code
	event.physical_keycode = code
	event.pressed = pressed
	Input.parse_input_event(event)
func run() -> void:
	var host = load("res://scripts/main.gd").new()
	root.add_child(host)
	await process_frame
	await process_frame
	check(host.header_panel.size.x <= root.size.x, "Toolbar stays within the desktop viewport")
	check(host.header_panel.size.y <= 65, "Desktop toolbar stays compact at the default resolution")
	var original: Vector3 = host.target
	key(KEY_UP, true)
	host._desktop_navigation(0.05)
	key(KEY_UP, false)
	if DisplayServer.window_is_focused(): check(host.target.distance_to(original) > 0.01, "Up arrow moves the performer forward")
	original = host.target
	key(KEY_SHIFT, true)
	key(KEY_UP, true)
	host._desktop_navigation(0.05)
	key(KEY_UP, false)
	key(KEY_SHIFT, false)
	if DisplayServer.window_is_focused(): check(host.target.y > original.y, "Shift + up moves the performer vertically")
	host.show_settings("audio")
	original = host.target
	key(KEY_RIGHT, true)
	host._desktop_navigation(0.05)
	key(KEY_RIGHT, false)
	check(host.target == original, "Arrow navigation is suspended while editing settings")
	print("Desktop toolbar and arrow navigation: PASS" if failures == 0 else "Desktop controls: FAIL")
	host.queue_free()
	await process_frame
	quit(0 if failures == 0 else 1)
