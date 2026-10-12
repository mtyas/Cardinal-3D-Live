# SPDX-License-Identifier: GPL-3.0-or-later
extends SceneTree
func _initialize() -> void: run.call_deferred()
func run() -> void:
	var host = load("res://scripts/main.gd").new()
	root.add_child(host)
	await create_timer(8.0).timeout
	assert(host.bridge.connected, "Native engine did not start")
	assert(host.show_stage.publishing, "Show publisher disconnected")
	assert(host.show_stage.peer.get_ready_state() == WebSocketPeer.STATE_OPEN, "Room did not connect")
	assert(host.show_stage.latest.speakers.size() == 2, "Missing native speakers")
	assert(host.show_stage.latest.lights.size() == 1, "Missing CV light")
	assert(not host.show_stage.visual_state.panels.is_empty(), "Missing shared rack panels")
	assert(not host.show_stage.visual_state.environment.is_empty(), "Missing shared scenery")
	assert(host.show_stage.visual_state.panels.any(func(p): return not p.texture.is_empty()), "Missing actual panel artwork")
	root.get_texture().get_image().save_png(OS.get_environment("CARDINAL_SHOW_SCREENSHOT")) if not OS.get_environment("CARDINAL_SHOW_SCREENSHOT").is_empty() else OK
	if OS.get_environment("CARDINAL_REQUIRE_SHOW_OBJECTS")=="1":
		assert(host.show_stage.latest.objects.size()==4,"Missing visual objects")
		for object in host.show_stage.latest.objects: assert(host.show_stage.fixtures.has("object/"+str(object.id)),"Missing rendered object")
	if OS.get_environment("CARDINAL_REQUIRE_CHAT_BOARD")=="1":
		assert(host.show_stage.latest.boards.size()==1,"Missing chat board state")
		assert(host.show_stage.fixtures.has("board/"+str(host.show_stage.latest.boards[0].id)),"Missing world-space chat board")
	# Keep the renderer/UI deliberately blocked longer than the audience buffer.
	# The external receiver checks audio arrival gaps across this pause and browsing.
	OS.delay_msec(700)
	host.module_browser.show_browser()
	await create_timer(3.0).timeout
	assert(host.show_stage.publishing, "Opening the module browser must retain the audio sender")
	for speaker in host.show_stage.latest.speakers:
		assert(speaker.dropped_samples == 0, "UI work must not overflow the Show audio ring")
	print("PASS: real Godot native Show publisher connected, streamed audio and CV fixtures")
	host.show_stage._toggle()
	host.queue_free()
	await process_frame
	quit()
