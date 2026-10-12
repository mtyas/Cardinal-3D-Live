# SPDX-License-Identifier: GPL-3.0-or-later
extends RefCounted
var textures := {}
var cursor := 0
var environment_id := 0
var environment_asset := ""
var generation := ""
func matrix(t: Transform3D) -> Array:
 var values := [t.basis.x.x,t.basis.x.y,t.basis.x.z,0,t.basis.y.x,t.basis.y.y,t.basis.y.z,0,t.basis.z.x,t.basis.z.y,t.basis.z.z,0,t.origin.x,t.origin.y,t.origin.z,1]
 return values.map(func(v): return snappedf(float(v),0.0001))
func shared_transform(t: Transform3D, offset: Vector3) -> Transform3D:
 t.origin+=offset
 return t
func asset(bytes: PackedByteArray, media: String, peer) -> String:
 var context := HashingContext.new()
 context.start(HashingContext.HASH_SHA256);context.update(bytes)
 var id := context.finish().hex_encode()
 peer.queue_asset(JSON.stringify({"type":"asset","id":id,"media":media,"data":Marshalls.raw_to_base64(bytes)}))
 return id
func capture(host, peer) -> Dictionary:
 if generation != str(host.generation):
  generation = str(host.generation)
  textures.clear()
 var offset := Vector3.ZERO if OS.get_environment("CARDINAL_3D_XR") == "1" else Vector3(0,1.5,0)
 var views: Array = host.modules.values()
 # One panel per visual update keeps PNG encoding away from audio delivery.
 if not views.is_empty():
  cursor = (cursor + 1) % views.size()
  var view = views[cursor]
  if view.texture != null and not textures.has(str(view.descriptor.id)):
   var image: Image = view.texture.get_image()
   if image != null and not image.is_empty():
    if image.get_height() > 512: image.resize(maxi(1,int(image.get_width()*512.0/image.get_height())),512,Image.INTERPOLATE_BILINEAR)
    var bytes := image.save_png_to_buffer()
    if bytes.size()>500000: image.resize(maxi(1,image.get_width()/2),maxi(1,image.get_height()/2));bytes=image.save_png_to_buffer()
    textures[str(view.descriptor.id)] = asset(bytes,"image/png",peer)
 var panels := []
 for view in views.slice(0,128):
  var t: Transform3D = view.global_transform;t.origin += offset
  var d: Dictionary = view.descriptor
  panels.append({"id":str(d.id),"name":str(d.get("name",d.get("model","Module"))),"matrix":matrix(t),"width":float(d.width)*0.002,"height":float(d.height)*0.002,"texture":textures.get(str(d.id),""),"controls":d.get("controls",[])})
 var cables := []
 for cable in host.snapshot.get("cables",[]).slice(0,512):
  var a := str(cable.output_module);var b := str(cable.input_module)
  if not host.modules.has(a) or not host.modules.has(b): continue
  var start: Vector3 = host.modules[a].port_position(int(cable.output_port),"output")+offset
  var end: Vector3 = host.modules[b].port_position(int(cable.input_port),"input")+offset
  cables.append({"a":[start.x,start.y,start.z],"b":[end.x,end.y,end.z],"color":str(cable.get("color","#65e7ff"))})
 var cases := []
 var cabinets := [host.rack_case]
 if host.xr_session != null and host.xr_session.rack_layout != null:
  cabinets=[]
  for entry in host.xr_session.rack_layout.cases: cabinets.append(entry["case"])
 for cabinet in cabinets:
  if cabinet.bounds.size == Vector2.ZERO: continue
  var t: Transform3D = cabinet.global_transform;t.origin += offset
  var rect: Rect2 = cabinet.bounds
  cases.append({"matrix":matrix(t),"bounds":[rect.position.x*.002,-rect.position.y*.002,rect.size.x*.002,rect.size.y*.002]})
 var env = host.immersive_environment
 if env != null and env.scenery != null and environment_id != env.scenery.get_instance_id():
  environment_id = env.scenery.get_instance_id()
  var groups := []
  for node in env.scenery.get_children():
   var mesh: Mesh = null
   var transforms := []
   if node is MeshInstance3D:
    mesh=node.mesh;transforms.append(matrix(shared_transform(node.global_transform,offset)))
   elif node is MultiMeshInstance3D:
    mesh=node.multimesh.mesh
    for i in range(mini(node.multimesh.instance_count,4096)): transforms.append(matrix(shared_transform(node.global_transform*node.multimesh.get_instance_transform(i),offset)))
   var shape := {}
   if mesh is BoxMesh: shape={"kind":"box","size":[mesh.size.x,mesh.size.y,mesh.size.z]}
   elif mesh is CylinderMesh: shape={"kind":"cylinder","top":mesh.top_radius,"bottom":mesh.bottom_radius,"height":mesh.height}
   elif mesh is SphereMesh: shape={"kind":"sphere","radius":mesh.radius,"height":mesh.height}
   if not shape.is_empty():
    shape["transforms"]=transforms
    shape["color"]="#"+node.material_override.albedo_color.to_html(false)
    groups.append(shape)
  environment_asset=asset(JSON.stringify(groups).to_utf8_buffer(),"application/json",peer)
 return {"cases":cases,"panels":panels,"cables":cables,"environment":environment_asset,"hour":env.hour if env != null else 14.0,"place":env.place if env != null else 7}
