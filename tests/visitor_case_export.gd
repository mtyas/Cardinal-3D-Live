extends SceneTree
class HostFixture extends RefCounted:
 var generation := "test"
 var modules := {}
 var snapshot := {"cables":[]}
 var rack_case
 var xr_session = null
 var immersive_environment = null
class PeerFixture extends RefCounted:
 func queue_asset(_text: String) -> void: pass
func _initialize() -> void:call_deferred("run")
func run() -> void:
 var cabinet=load("res://scripts/rack_case.gd").new();root.add_child(cabinet)
 cabinet.sync([{"x":0,"y":0,"width":300,"height":380},{"x":0,"y":380,"width":300,"height":380}])
 var host := HostFixture.new();host.rack_case=cabinet
 var exporter=load("res://scripts/show_visuals.gd").new()
 var exported: Dictionary=exporter.capture(host,PeerFixture.new())
 var output := OS.get_environment("VISITOR_CASE_EXPORT_OUTPUT")
 if not output.is_empty():
  var file := FileAccess.open(output, FileAccess.WRITE);file.store_string(JSON.stringify(exported));file.close()
 assert(exported.cases.size()==1)
 var backs := 0;var sides := 0;var mounting_rows := 0
 for group in exported.cases[0].parts:
  if group.kind!="box":continue
  if is_equal_approx(group.size[2],0.012):backs+=group.transforms.size()
  if is_equal_approx(group.size[0],0.04) and is_equal_approx(group.size[2],0.23):sides+=group.transforms.size()
  if is_equal_approx(group.size[2],0.035):mounting_rows+=group.transforms.size()
 assert(backs==1 and sides==2 and mounting_rows==4,"Export must include native back, side cheeks and every row's mounting rails")
 var old_size: float=cabinet.bounds.size.x
 cabinet.sync([{"x":0,"y":0,"width":600,"height":380}])
 var resized: Dictionary=exporter.capture(host,PeerFixture.new())
 assert(resized.cases[0].bounds[2]>old_size*.002)
 cabinet.queue_free()
 print("PASS: visitor export includes native enclosure back, sides, multi-row rails and resized layout")
 quit()
