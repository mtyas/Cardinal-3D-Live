# SPDX-License-Identifier: GPL-3.0-or-later
extends RefCounted
var bridge
var peer
var policy
var adapter
var enabled := false
var local_busy := false
var ready := false
var native_generation := ""
var serial := 0
var grants := {}
var pending_actions := []
var requested := {}
var selection: OptionButton
var grant_button: Button
var revoke_button: Button
var status: Label
var members_signature := ""

func setup(owner_bridge, column: VBoxContainer) -> void:
	bridge = owner_bridge
	if not bridge.has_signal("local_interaction"): return
	adapter = preload("res://scripts/control_native_adapter.gd").new(bridge)
	policy = preload("res://scripts/control_authority.gd").new(func(): return Time.get_ticks_msec(), func(_m, _p): return true, adapter.apply, adapter.begin, adapter.end, adapter.cable)
	bridge.local_interaction.connect(_local_input)
	var toggle := CheckButton.new()
	toggle.text = "Allow invited performers to play"
	toggle.toggled.connect(func(value): enabled=value;stop())
	column.add_child(toggle)
	selection = OptionButton.new();selection.size_flags_horizontal=Control.SIZE_EXPAND_FILL;selection.text_overrun_behavior=TextServer.OVERRUN_TRIM_ELLIPSIS;column.add_child(selection)
	var actions := HBoxContainer.new();column.add_child(actions)
	var grant := Button.new();grant.text="Invite to play";grant.size_flags_horizontal=Control.SIZE_EXPAND_FILL
	grant_button=grant;grant.disabled=true
	grant.pressed.connect(func():
		if not enabled or not ready or selection.selected<0:return
		var actor: String=selection.get_item_metadata(selection.selected)
		requested[actor]=true
		_send({"type":"control_grant","actor":actor,"epoch":policy.epoch})
	)
	actions.add_child(grant)
	var revoke := Button.new();revoke.text="Make read-only";revoke.size_flags_horizontal=Control.SIZE_EXPAND_FILL
	revoke_button=revoke;revoke.disabled=true
	revoke.pressed.connect(func():
		if selection.selected<0:return
		var actor: String=selection.get_item_metadata(selection.selected)
		policy.revoke(actor);grants.erase(actor);requested.erase(actor)
		_send({"type":"control_revoke","actor":actor})
	)
	actions.add_child(revoke)
	status=Label.new();status.autowrap_mode=TextServer.AUTOWRAP_WORD_SMART;status.add_theme_font_size_override("font_size",14);status.text="Remote control disabled";column.add_child(status)

func _send(data: Dictionary) -> void:
	if peer != null and not peer.send_command_text(JSON.stringify(data)):
		peer.close()

func stop() -> void:
	if policy == null:return
	for actor in policy.performers.keys():policy.revoke(actor)
	grants.clear();requested.clear();pending_actions.clear();ready=false;native_generation="";local_busy=false
	if peer != null:_send({"type":"control_session","epoch":"disabled-"+str(Time.get_ticks_usec())})
	if status != null:status.text="Remote control enabled; awaiting session" if enabled else "Remote control disabled"

func _local_input(operation: String, data: Dictionary) -> void:
	if policy == null:return
	if operation=="pointer" and data.get("phase")=="down":
		local_busy=true
		for lease in policy.leases.values():policy.local_grab(lease.module,lease.parameter)
	elif operation=="release" or (operation=="pointer" and data.get("phase")=="up"):
		local_busy=false;policy.local_targets.clear()

func tick(transport, room: Dictionary, connected: bool) -> void:
	if policy == null:return
	var selected_actor: String=selection.get_item_metadata(selection.selected) if selection.selected>=0 else ""
	grant_button.disabled=not (connected and enabled and ready and not selected_actor.is_empty() and not grants.has(selected_actor))
	revoke_button.disabled=not (connected and grants.has(selected_actor))
	if peer != transport:
		stop();peer=transport
	if not connected:
		if ready or not grants.is_empty():stop()
		return
	# A current audience list is also a disconnect backstop if event delivery fails.
	var members: Array=room.get("members",[]).filter(func(m):return m.get("role")!="performer")
	selection.disabled=not (enabled and connected and not members.is_empty())
	var signature := JSON.stringify(members.map(func(m):return [m.id,m.name]))
	if signature!=members_signature:
		members_signature=signature
		var selected: String=selection.get_item_metadata(selection.selected) if selection.selected>=0 else ""
		selection.clear()
		if members.is_empty(): selection.text="No visitors connected"
		for member in members:
			selection.add_item(str(member.name)+" · "+str(member.id).left(8))
			selection.set_item_metadata(selection.item_count-1,str(member.id))
			if member.id==selected:selection.select(selection.item_count-1)
	for actor in grants.keys():
		if not members.any(func(m):return m.id==actor):policy.revoke(actor);grants.erase(actor)
	for actor in requested.keys():
		if not members.any(func(m):return m.id==actor):requested.erase(actor)
	if enabled and native_generation!=bridge.generation:
		stop();native_generation=bridge.generation;serial+=1
		policy.reset(str(Time.get_ticks_usec())+"-"+str(serial)+"-"+native_generation)
		_send({"type":"control_session","epoch":policy.epoch})
	policy.expire()
	for event in peer.take_control_events():
		if not enabled or event.get("epoch")!=policy.epoch:continue
		if event.type=="control_session":ready=true
		elif event.type=="control_permission":
			var actor: String=event.get("actor","")
			if event.get("enabled",false) and ready and requested.has(actor):
				if policy.grant(actor):grants[actor]=event.grant
			else:
				policy.revoke(actor);grants.erase(actor)
				requested.erase(actor)
				if event.get("enabled",false):_send({"type":"control_revoke","actor":actor})
		elif event.type=="control_action":
			if pending_actions.size()>=32:
				stop();peer.close();return
			pending_actions.append(event)
	# One compact native action per frame; never do duplicate full scene captures.
	if not pending_actions.is_empty():
		var event: Dictionary=pending_actions.pop_front()
		var actor: String=event.get("actor", "")
		if event.get("epoch")==policy.epoch and grants.get(actor)==event.get("grant"):
			var result: Dictionary
			if local_busy:
				result={"ok":false,"reason":"host_busy","epoch":policy.epoch,"sequence":event.sequence}
			else: result=policy.handle(actor,event)
			result.merge({"type":"control_result","actor":actor,"grant":event.grant},true)
			_send(result)
	status.text="Collaborative controls: %d granted · %d active grabs" % [grants.size(),policy.leases.size()] if enabled and ready else ("Waiting for control session" if enabled else "Remote control disabled")
