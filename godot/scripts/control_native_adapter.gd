# SPDX-License-Identifier: GPL-3.0-or-later
extends RefCounted
# Main-thread adapter for ControlAuthority. It uses the existing embedded bridge
# and ingests its replies so descriptors/generation remain on the normal path.
var bridge
var gestures := {}
var request := -1
func _init(embedded_bridge) -> void:
	bridge = embedded_bridge

func _key(module: String, parameter: int) -> String:
	return module + "/" + str(parameter)

func _send(module: String, parameter: int, token: String, phase: String, value := 0.0) -> Dictionary:
	if not bridge.connected or bridge.native == null: return {}
	request -= 1
	var payload := {"op":"parameter_edit", "reply_only":true, "request":request, "generation":bridge.generation,
		"module":module, "param":parameter, "gesture":token, "phase":phase, "value":value}
	var raw: String = bridge.native.messages_json(JSON.stringify(payload))
	var messages: Variant = JSON.parse_string(raw)
	if not messages is Array: return {}
	var accepted := false
	var result := {}
	for message in messages:
		if message.get("request") != request: continue
		if message.get("type") == "ack": accepted = message.get("ok", false)
		if message.get("type") == "parameter_value": result = message
	bridge._ingest(raw)
	return result if accepted else {}

func begin(module: String, parameter: int, token: String) -> Variant:
	var key := _key(module, parameter)
	if gestures.has(key): return false
	var result := _send(module, parameter, token, "begin")
	if result.is_empty(): return false
	gestures[key] = {"token":token, "generation":bridge.generation}
	return result

func apply(module: String, parameter: int, value: float) -> Variant:
	var key := _key(module, parameter)
	if not gestures.has(key) or gestures[key].generation != bridge.generation: return null
	var result := _send(module, parameter, gestures[key].token, "update", value)
	return result.get("value")

func end(module: String, parameter: int, token: String) -> void:
	var key := _key(module, parameter)
	if not gestures.has(key) or gestures[key].token != token: return
	var generation: String = gestures[key].generation
	gestures.erase(key)
	if generation == bridge.generation: _send(module, parameter, token, "end")

func cable(message: Dictionary) -> Dictionary:
	if not bridge.connected or bridge.native == null: return {}
	var operation: String = message.get("action", "")
	if operation not in ["cable_connect", "cable_disconnect"]: return {}
	request -= 1
	var payload := {"op":operation, "request":request, "generation":bridge.generation}
	for key in ["wiring", "input_module", "input_port", "output_module", "output_port", "replace_cable", "cable_id"]:
		if message.has(key): payload[key] = message[key]
	var raw: String = bridge.native.messages_json(JSON.stringify(payload))
	var messages: Variant = JSON.parse_string(raw)
	if not messages is Array: return {}
	var result := {}
	for item in messages:
		if item.get("type") == "ack" and item.get("request") == request: result["ok"] = item.get("ok", false)
		if item.get("type") == "snapshot": result["wiring"] = item.get("wiring", "")
	bridge._ingest(raw)
	return result
