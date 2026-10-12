extends SceneTree
class PortView extends "res://scripts/module_view.gd":
 func port_position(_port: int, _direction: String) -> Vector3: return global_position
func _initialize() -> void: call_deferred("run")
func run() -> void:
 var host=load("res://scripts/main.gd").new();root.add_child(host);await process_frame
 host.bridge.set_process(false)
 for id in ["1","2","3"]:
  var view=PortView.new();view.descriptor={"id":id};host.rack.add_child(view);view.position.x=float(id)*.2;host.modules[id]=view
 var a={"id":"a","output_module":"1","output_port":0,"input_module":"2","input_port":0,"color":"#ffffff"}
 var b={"id":"b","output_module":"1","output_port":0,"input_module":"3","input_port":0,"color":"#ffffff"}
 host._rebuild_cables([a,b]);assert(host.cable_views.size()==2)
 var first=host.cable_views.a.node;var second=host.cable_views.b.node
 host.modules["3"].position.y=.2;host._rebuild_cables([a,b])
 assert(host.cable_views.a.node==first,"Unchanged cable must retain its meshes")
 assert(host.cable_views.b.node!=second,"Moved endpoint must rebuild its cable")
 host._rebuild_cables([a]);assert(host.cable_views.size()==1 and host.cable_views.a.node==first)
 host._rebuild_cables([]);assert(host.cable_views.is_empty() and host.cables.get_child_count()==0)
 var transport=load("res://scripts/show_transport.gd").new()
 transport.room_state='{"type":"room","revision":1,"members":[],"chat":[]}'
 transport.room_revision=1
 var original=transport.room_snapshot();assert(original.revision==1)
 transport.room_state='{"type":"room","revision":2}'
 assert(transport.room_snapshot().revision==1,"Unchanged revision must use parsed cache")
 transport.room_revision=2;assert(transport.room_snapshot().revision==2)
 print("Selective cable rebuild and room snapshot cache: PASS")
 host.queue_free();await process_frame;quit()
