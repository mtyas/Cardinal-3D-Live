# SPDX-License-Identifier: GPL-3.0-or-later
extends Node3D
## Deterministic stage geometry. Animation is driven by native DSP phase.
var kind := "figure"
var phase := 0.0
var frequency := 1.0
var values := [0.8,1,1,.25,.75,1,0,0,-4,0,1,0]
var accent := StandardMaterial3D.new()
var metal := StandardMaterial3D.new()
var moving := []
var particles: MultiMeshInstance3D
func shape(mesh: Mesh, at: Vector3, mat: Material, parent: Node3D = self) -> MeshInstance3D:
 var node := MeshInstance3D.new();node.mesh=mesh;node.position=at;node.material_override=mat;parent.add_child(node);return node
func ball(radius: float) -> SphereMesh:
 var mesh := SphereMesh.new();mesh.radius=radius;mesh.height=radius*2;mesh.radial_segments=16;mesh.rings=8;return mesh
func box(size: Vector3) -> BoxMesh:
 var mesh := BoxMesh.new();mesh.size=size;return mesh
func cylinder(radius: float, height: float) -> CylinderMesh:
 var mesh := CylinderMesh.new();mesh.top_radius=radius;mesh.bottom_radius=radius;mesh.height=height;mesh.radial_segments=32;return mesh
func torus(radius: float, thickness: float) -> TorusMesh:
 var mesh := TorusMesh.new();mesh.inner_radius=radius-thickness;mesh.outer_radius=radius+thickness;mesh.rings=32;mesh.ring_segments=8;return mesh
func _ready() -> void:
 metal=preload("res://scripts/show_materials.gd").surface("metal",Color("607183"),.75,.3)
 accent.emission_enabled=true;accent.roughness=.3;accent.metallic=.25
 if kind == "figure":
  shape(cylinder(.38,.08),Vector3(0,.04,0),metal)
  var dancer := Node3D.new();add_child(dancer);moving.append(dancer)
  shape(box(Vector3(.34,.46,.22)),Vector3(0,1.05,0),metal,dancer)
  for x in [-.09,0,.09]: shape(box(Vector3(.045,.16,.012)),Vector3(x,1.09,.118),accent,dancer)
  shape(torus(.11,.018),Vector3(0,1.30,0),accent,dancer)
  shape(ball(.15),Vector3(0,1.46,0),accent,dancer)
  shape(box(Vector3(.23,.07,.025)),Vector3(0,1.48,.14),metal,dancer)
  for side in [-1,1]:
   var arm := Node3D.new();arm.position=Vector3(side*.24,1.23,0);dancer.add_child(arm);moving.append(arm)
   shape(ball(.065),Vector3.ZERO,accent,arm)
   shape(cylinder(.045,.25),Vector3(0,-.14,0),metal,arm)
   shape(ball(.055),Vector3(0,-.28,0),accent,arm)
   shape(cylinder(.035,.22),Vector3(0,-.40,.05),metal,arm)
   shape(ball(.065),Vector3(0,-.53,.09),accent,arm)
   var leg := Node3D.new();leg.position=Vector3(side*.10,.80,0);dancer.add_child(leg);moving.append(leg)
   shape(cylinder(.065,.57),Vector3(0,-.30,0),metal,leg)
   shape(box(Vector3(.13,.09,.24)),Vector3(0,-.65,.06),accent,leg)
 elif kind == "sculpture":
  shape(cylinder(.45,.16),Vector3(0,.08,0),metal)
  shape(cylinder(.075,1.1),Vector3(0,.65,0),metal)
  for i in range(4): shape(torus(.075,.015),Vector3(0,.3+i*.24,0),accent)
  for i in range(3):
   var ring := shape(torus(.45+i*.13,.028),Vector3(0,1.4,0),accent);moving.append(ring)
  for i in range(8): moving.append(shape(ball(.07),Vector3.ZERO,accent))
 else:
  if kind == "fountain":
   var stone=preload("res://scripts/show_materials.gd").surface("stone",Color("8a939f"),.05,.9)
   var water := StandardMaterial3D.new();water.albedo_color=Color("317c9c");water.metallic=.35;water.roughness=.15
   shape(cylinder(.85,.13),Vector3(0,.065,0),stone)
   shape(cylinder(.70,.012),Vector3(0,.15,0),water)
   for i in range(8):
    var a := i*TAU/8
    shape(cylinder(.045,.09),Vector3(cos(a)*.1,.19,sin(a)*.1),metal)
   for i in range(3): shape(torus(.3+i*.16,.006),Vector3(0,.164,0),water)
   shape(torus(.78,.06),Vector3(0,.15,0),accent)

  else:
   shape(cylinder(.22,.16),Vector3(0,.08,0),metal)
   shape(torus(.19,.035),Vector3(0,.19,0),accent)
  particles=MultiMeshInstance3D.new();particles.multimesh=MultiMesh.new();particles.multimesh.transform_format=MultiMesh.TRANSFORM_3D
  particles.multimesh.mesh=ball(.028 if kind == "fountain" else .035)
  particles.multimesh.instance_count=192 if kind == "particles" else 128
  particles.material_override=accent;particles.cast_shadow=GeometryInstance3D.SHADOW_CASTING_SETTING_OFF;add_child(particles)
func apply_state(state: Dictionary) -> void:
 values=state.values;phase=float(state.phase);frequency=float(state.frequency)
 position=Vector3(values[6],values[7],values[8]);rotation.y=deg_to_rad(values[9]);scale=Vector3.ONE*float(values[2])
 accent.albedo_color=Color(values[3],values[4],values[5]);accent.emission=accent.albedo_color;accent.emission_energy_multiplier=.2+float(values[0])*.8
func _process(delta: float) -> void:
 phase=fmod(phase+delta*frequency,1.0)
 var angle := phase*TAU
 var activity := float(values[0]);var spread := float(values[10]);var style := int(round(values[11]))
 if kind == "figure" and moving.size()==5:
  moving[0].position.y=abs(sin(angle))*activity*.09
  moving[0].rotation.z=sin(angle)*activity*.12
  for index in [1,3]:
   var side := -1 if index==1 else 1
   moving[index].rotation.z=side*(.2+activity*(.65+sin(angle+index)*.5))
   moving[index].rotation.x=sin(angle+index)*activity*(.8 if style==1 else .4)
   moving[index+1].rotation.x=sin(angle+index+PI)*activity*.20
 elif kind == "sculpture" and moving.size()==11:
  for i in range(3):moving[i].rotation=Vector3(angle*(i+1)*activity,angle*activity*(i%2),i*.7+sin(angle)*activity)
  for i in range(8):
   var a := angle*activity+i*TAU/8
   moving[i+3].position=Vector3(cos(a)*spread*.75,1.4+sin(a*(style+1))*.25,sin(a)*spread*.75)
 elif particles != null:
  particles.visible=activity>.001
  for i in range(particles.multimesh.instance_count):
   var t := fmod(phase+(floor(float(i)/8.0)/16.0 if kind=="fountain" else i*0.61803398875),1.0)
   var a := (float(i%8)*TAU/8.0 if kind=="fountain" else i*2.39996323)+(angle if style==1 else 0.0)
   var pos: Vector3
   if kind == "fountain":
    var radius := spread*t*.75
    pos=Vector3(cos(a)*radius,.18+4*t*(1-t)*(1.2+activity*1.8),sin(a)*radius)
   else:
    var radius := spread*(t if style==2 else .15+sqrt(t))
    pos=Vector3(cos(a)*radius,.2+t*(1.0+activity*2.5),sin(a)*radius)
   var size := (0.4+activity)*(.4+sin(t*PI))
   particles.multimesh.set_instance_transform(i,Transform3D(Basis.IDENTITY.scaled(Vector3.ONE*size),pos))
