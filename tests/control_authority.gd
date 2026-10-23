extends SceneTree
var now := 0
var exists := true
var applied := []
var sequence := {}
var policy
func _initialize() -> void: call_deferred("run")
func command(actor: String, action: String, extra := {}) -> Dictionary:
	sequence[actor] = sequence.get(actor, 0) + 1
	var message := {"epoch":policy.epoch, "sequence":sequence[actor], "module":"42", "parameter":0, "action":action}
	message.merge(extra, true)
	return policy.handle(actor, message)
func run() -> void:
	policy = load("res://scripts/control_authority.gd").new(func(): return now, func(_m, _p): return exists, func(m, p, v): applied.append([m,p,v]); return snappedf(v, 0.25))
	policy.reset("patch-a")
	assert(command("visitor", "begin").reason == "read_only")
	assert(policy.grant("a") and policy.grant("b") and policy.grant("c"))
	var first: Dictionary = command("a", "begin")
	assert(first.ok)
	assert(command("b", "begin").reason == "busy")
	assert(command("b", "update", {"lease":first.lease,"value":0.5}).reason == "lost_lease")
	var value: Dictionary = command("a", "update", {"lease":first.lease,"value":0.61})
	assert(value.ok and value.value == 0.5 and value.revision == 1)
	assert(command("a", "update", {"lease":first.lease,"value":NAN}).reason == "invalid_value")
	assert(command("a", "update", {"lease":first.lease,"value":2}).reason == "invalid_value")
	assert(applied.size() == 1)
	assert(command("a", "end", {"lease":first.lease}).ok)
	var second: Dictionary = command("b", "begin")
	assert(second.ok and second.lease != first.lease)
	assert(command("a", "update", {"lease":first.lease,"value":0.2}).reason == "lost_lease")
	policy.local_grab("42", 0)
	assert(command("b", "update", {"lease":second.lease,"value":0.2}).reason == "host_grabbing")
	assert(command("c", "begin").reason == "host_grabbing")
	policy.local_release("42", 0)
	assert(command("b", "update", {"lease":second.lease,"value":0.2}).reason == "lost_lease")
	assert(command("c", "begin").ok)
	now += 1501
	assert(command("a", "begin").ok)
	policy.revoke("a")
	assert(command("a", "begin").reason == "read_only")
	assert(command("b", "begin").ok)
	policy.reset("patch-b")
	assert(policy.leases.is_empty() and policy.performers.is_empty())
	assert(policy.grant("a"))
	assert(command("a", "begin", {"epoch":"patch-a"}).reason == "stale_epoch")
	assert(command("a", "begin", {"sequence":0.5}).reason == "invalid_sequence")
	assert(command("a", "begin", {"module":"042"}).reason == "invalid_target")
	assert(command("a", "begin", {"action":"load_patch"}).reason == "unsupported_action")
	var third: Dictionary = command("a", "begin")
	assert(third.ok)
	assert(policy.handle("a", {"epoch":"patch-b","sequence":sequence.a}).reason == "stale_sequence")
	exists = false
	assert(command("a", "update", {"lease":third.lease,"value":0.5}).reason == "missing_target")
	assert(policy.leases.is_empty())
	exists = true
	for i in range(30): command("a", "begin")
	assert(command("a", "begin").reason == "rate_limited")
	now += 2000
	assert(command("a", "begin").ok)
	for i in range(15): assert(policy.grant("extra-" + str(i)))
	assert(not policy.grant("overflow"))
	assert(applied.size() == 1, "Rejected requests must never invoke the engine adapter")
	policy.reset("patch-c")
	for actor in ["a", "b", "c"]: assert(policy.grant(actor))
	var concurrent := []
	for i in range(3):
		var actor: String = ["a", "b", "c"][i]
		var lease: Dictionary = command(actor, "begin", {"parameter":i})
		assert(lease.ok and lease.sequence == sequence[actor])
		concurrent.append(lease.lease)
	for i in range(3):
		assert(command(["a", "b", "c"][i], "update", {"parameter":i,"lease":concurrent[i],"value":0.7}).ok)
	assert(policy.leases.size() == 3 and applied.size() == 4)
	policy.revoke("b")
	assert(policy.leases.size() == 2)
	assert(policy.grant("b"))
	assert(command("b", "update", {"parameter":1,"lease":concurrent[1],"value":0.8}).reason == "lost_lease")
	policy.apply_value = func(_m, _p, _v): return null
	assert(command("a", "update", {"parameter":0,"lease":concurrent[0],"value":0.8}).reason == "apply_failed")
	print("Control authority: grants, ownership, canonical values, local priority, epochs, replay, expiry and bounds: PASS")
	quit()
