extends SceneTree

func _initialize() -> void: run.call_deferred()

func run() -> void:
	var host = load("res://scripts/main.gd").new()
	root.add_child(host)
	await create_timer(8.0).timeout
	assert(host.bridge.connected, "Native engine must start")
	assert(host.show_stage.controls.policy != null, "Collaborator controls must be built")
	host.show_settings("show")
	await process_frame
	await process_frame
	assert(host.show_stage.controls.grant_button.disabled, "Grant must be disabled without a selected visitor")
	assert(host.settings_tabs.show.button_pressed, "Current settings section must be indicated")
	await RenderingServer.frame_post_draw
	root.get_texture().get_image().save_png(OS.get_environment("CARDINAL_UI_SCREENSHOT_DIR").path_join("interface-host-session.png"))
	root.size = Vector2i(1024, 700)
	await create_timer(0.2).timeout
	host._fit_settings()
	await process_frame
	var rect: Rect2 = host.settings_panel.get_global_rect()
	assert(rect.end.x <= host.settings_panel.get_parent().size.x and rect.end.y <= host.settings_panel.get_parent().size.y, "Session panel must fit a smaller desktop")
	for section in ["audio", "environment", "about"]:
		host.show_settings(section)
		await process_frame
		await process_frame
		rect = host.settings_panel.get_global_rect()
		assert(rect.end.x <= host.settings_panel.get_parent().size.x and rect.end.y <= host.settings_panel.get_parent().size.y, "Settings section overflows: " + section)
	host.show_settings("show")
	await RenderingServer.frame_post_draw
	root.get_texture().get_image().save_png(OS.get_environment("CARDINAL_UI_SCREENSHOT_DIR").path_join("interface-host-small.png"))
	var escape := InputEventKey.new()
	escape.keycode = KEY_ESCAPE
	escape.pressed = true
	host._input(escape)
	assert(not host.settings_panel.visible, "Escape closes settings")
	print("PASS: native Session, access buttons, settings navigation, 1024px fitting and Escape")
	host.queue_free()
	await process_frame
	quit()
