extends SceneTree
func _initialize() -> void: run.call_deferred()
func run() -> void:
 var host = load("res://scripts/main.gd").new()
 root.add_child(host)
 await create_timer(8).timeout
 assert(host.bridge.connected, "Native engine must start")
 assert(host.desktop_layout != null and host.rack_layout != null, "Desktop exposes the shared rack layout")
 var settings_count := 0
 for child in host.toolbar.get_children():
  if child is Button:
   assert(child.text != "Session", "Session is inside Settings")
   if child.text == "Settings": settings_count += 1
 assert(settings_count == 1)
 assert(not host.show_stage.publishing, "Manual Live mode must remain offline")
 host.show_stage.open_live()
 host.show_stage.session_name.text = " "
 host.show_stage._toggle()
 assert(not host.show_stage.publishing, "A blank name cannot go live")
 host.show_stage.session_name.text = "Layout test session"
 var layout = host.rack_layout
 var adapter = host.desktop_layout
 var before := JSON.stringify(host.snapshot.get("cables", []))
 var identities: Array = host.modules.keys()
 var selected = host.modules[identities[0]]
 var descriptor: Dictionary = selected.descriptor.duplicate(true)
 layout.mode_button.button_pressed = true
 adapter.select_view(selected)
 layout.add_case()
 layout.transfer_selected()
 assert(layout.cases.size() == 2 and layout.membership[identities[0]] == 1, "Selected module moves into a second rack")
 adapter.fields[0].value += .3
 adapter.fields[4].value = 25
 await process_frame
 assert(is_equal_approx(layout.cases[1].root.rotation_degrees.y, 25.0), "Desktop rotation updates the case")
 assert(selected.descriptor == descriptor, "Physical placement preserves DSP module coordinates")
 assert(JSON.stringify(host.snapshot.get("cables", [])) == before, "Physical placement preserves cables")
 var saved_path := OS.get_environment("CARDINAL_EMBEDDED_USER_DIR").path_join("layout-test.vcv")
 layout.save(saved_path + ".3d.json")
 layout.arrange(2)
 layout.restore_from(saved_path)
 assert(is_equal_approx(layout.cases[1].root.rotation_degrees.y, 25.0), "Saved layout restores rotation")
 host._frame_rack()
 assert(host.target.distance_to(selected.global_position) < host.distance, "Frame rack includes separated cases")
 host.show_settings("racks")
 await process_frame
 await RenderingServer.frame_post_draw
 root.get_texture().get_image().save_png(OS.get_environment("CARDINAL_UI_SCREENSHOT_DIR").path_join("interface-racks.png"))
 host.show_stage._toggle()
 await create_timer(3).timeout
 assert(host.show_stage.publishing and host.show_stage.live_state == "live", "Live indicator follows the connected broadcast")
 assert(host.show_stage.live_button.theme_type_variation == "LiveButton", "Live uses the red button theme")
 assert(not host.show_stage.session_name.editable, "Name is stable during a live performance")
 assert(host.show_stage.latest.session_title == "Layout test session")
 host.show_settings("show")
 await RenderingServer.frame_post_draw
 root.get_texture().get_image().save_png(OS.get_environment("CARDINAL_UI_SCREENSHOT_DIR").path_join("interface-live.png"))
 var board = load("res://scripts/show_chat_board.gd").new()
 host.add_child(board)
 board.apply_state({"values":[3,2,.065,.85,.95,1,.04,.08,.14,3,1.8,-3,0,1]},[],"Layout test session")
 assert(board.label.text.begins_with("Layout test session"), "Shared board displays the session title")
 await create_timer(4).timeout
 host.show_stage._toggle()
 await create_timer(.1).timeout
 assert(host.show_stage.live_state == "offline", "Stopping clears the live indicator")
 print("PASS: merged Settings, manual Live/name/red indicator/board title, desktop split/rotation/save and unchanged synth cables")
 host.queue_free()
 await process_frame
 quit()
