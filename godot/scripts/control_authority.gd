# SPDX-License-Identifier: GPL-3.0-or-later
extends RefCounted
# Host-thread policy prototype. Network identity/grants must come from the host,
# never from fields in a client message. No engine or transport is created here.
const LEASE_MS := 1500
const MAX_PERFORMERS := 16
const BURST := 20.0
const RATE := 60.0
var epoch := ""
var revision := 0
var performers := {}
var leases := {}
var local_targets := {}
var next_lease := 0
var clock: Callable
var target_exists: Callable
var apply_value: Callable
var begin_edit: Callable
var end_edit: Callable
var edit_cable: Callable

func _init(now: Callable, exists: Callable, apply: Callable, begin := Callable(), end := Callable(), cable := Callable()) -> void:
	clock = now
	target_exists = exists
	apply_value = apply
	begin_edit = begin
	end_edit = end
	edit_cable = cable

func reset(new_epoch: String) -> void:
	# Called on patch replacement or host-session replacement. Re-grant only
	# after the new baseline has been delivered and acknowledged.
	assert(not new_epoch.is_empty() and new_epoch != epoch)
	for key in leases.keys(): _release(key)
	epoch = new_epoch
	revision = 0
	performers.clear()
	leases.clear()
	local_targets.clear()

func grant(actor: String) -> bool:
	if actor.is_empty() or epoch.is_empty(): return false
	if performers.has(actor): return true
	if performers.size() >= MAX_PERFORMERS: return false
	performers[actor] = {"sequence":0, "tokens":BURST, "time":int(clock.call())}
	return true

func revoke(actor: String) -> void:
	performers.erase(actor)
	for key in leases.keys():
		if leases[key].actor == actor: _release(key)

func _release(key: String) -> void:
	if not leases.has(key): return
	var lease: Dictionary = leases[key]
	leases.erase(key)
	revision += 1
	if end_edit.is_valid(): end_edit.call(lease.module, lease.parameter, lease.token)

func expire() -> void:
	var now := int(clock.call())
	for key in leases.keys():
		if leases[key].until <= now: _release(key)

func local_grab(module: String, parameter: int) -> void:
	# Host interaction wins. A stale remote token can never resume this grab.
	_release(_key(module, parameter))
	local_targets[_key(module, parameter)] = true

func local_release(module: String, parameter: int) -> void:
	local_targets.erase(_key(module, parameter))

func _key(module: String, parameter: int) -> String:
	return module + "/" + str(parameter)

func _reply(ok: bool, reason: String) -> Dictionary:
	return {"ok":ok, "reason":reason, "epoch":epoch, "revision":revision}

func handle(actor: String, message: Dictionary) -> Dictionary:
	var reply := _handle(actor, message)
	# Echo only a validated bounded request number, never arbitrary client data.
	if _integer(message.get("sequence"), 1, 2147483647): reply["sequence"] = int(message.sequence)
	return reply

func _handle(actor: String, message: Dictionary) -> Dictionary:
	expire()
	if not performers.has(actor): return _reply(false, "read_only")
	if message.get("epoch") != epoch: return _reply(false, "stale_epoch")
	var sequence: Variant = message.get("sequence")
	if not _integer(sequence, 1, 2147483647): return _reply(false, "invalid_sequence")
	var peer: Dictionary = performers[actor]
	if sequence <= peer.sequence: return _reply(false, "stale_sequence")
	peer.sequence = int(sequence)
	var now := int(clock.call())
	peer.tokens = minf(BURST, peer.tokens + maxf(0, now - peer.time) * RATE / 1000.0)
	peer.time = now
	if peer.tokens < 1: return _reply(false, "rate_limited")
	peer.tokens -= 1
	if message.get("action") in ["cable_connect", "cable_disconnect"]:
		for lease in leases.values():
			if lease.actor == actor: return _reply(false, "already_grabbing")
		if not edit_cable.is_valid(): return _reply(false, "unsupported_action")
		var result: Dictionary = edit_cable.call(message)
		if not result.get("ok", false): return _reply(false, "wiring_changed_or_invalid")
		revision += 1
		var cable_reply := _reply(true, "patched")
		cable_reply["wiring"] = result.get("wiring", "")
		return cable_reply
	var module: Variant = message.get("module")
	var parameter: Variant = message.get("parameter")
	if not module is String or module.is_empty() or module.length() > 20 or not module.is_valid_int():
		return _reply(false, "invalid_target")
	if str(module.to_int()) != module or module.to_int() < 0 or not _integer(parameter, 0, 65535):
		return _reply(false, "invalid_target")
	var key := _key(module, int(parameter))
	if local_targets.has(key): return _reply(false, "host_grabbing")
	if not target_exists.call(module, int(parameter)):
		_release(key)
		return _reply(false, "missing_target")
	var action: Variant = message.get("action")
	if action == "begin":
		if leases.has(key): return _reply(false, "busy")
		# One active gesture per connection bounds state and simplifies recovery.
		for lease in leases.values():
			if lease.actor == actor: return _reply(false, "already_grabbing")
		next_lease += 1
		var token := str(next_lease)
		var started: Variant = begin_edit.call(module, int(parameter), token) if begin_edit.is_valid() else true
		if not started: return _reply(false, "begin_failed")
		leases[key] = {"actor":actor, "token":token, "until":now + LEASE_MS, "module":module, "parameter":int(parameter)}
		var reply := _reply(true, "granted")
		if started is Dictionary and started.has("value"): reply["value"] = started.value
		reply["lease"] = token
		reply["lease_ms"] = LEASE_MS
		return reply
	if action != "update" and action != "end": return _reply(false, "unsupported_action")
	if not leases.has(key) or leases[key].actor != actor or leases[key].token != message.get("lease"):
		return _reply(false, "lost_lease")
	if action == "end":
		_release(key)
		return _reply(true, "released")
	var value: Variant = message.get("value")
	if not (value is float or value is int) or not is_finite(float(value)) or value < 0 or value > 1:
		return _reply(false, "invalid_value")
	# Adapter must validate against the current native parameter and return the
	# canonical normalized value (including native snapping), or null on failure.
	var canonical: Variant = apply_value.call(module, int(parameter), float(value))
	if not (canonical is float or canonical is int) or not is_finite(float(canonical)) or canonical < 0 or canonical > 1:
		_release(key)
		return _reply(false, "apply_failed")
	leases[key].until = now + LEASE_MS
	revision += 1
	var reply := _reply(true, "applied")
	reply["value"] = canonical
	return reply

func _integer(value: Variant, minimum: int, maximum: int) -> bool:
	return (value is int or value is float) and is_finite(float(value)) and value >= minimum and value <= maximum and value == floor(value)
