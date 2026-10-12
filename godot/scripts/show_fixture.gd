# SPDX-License-Identifier: GPL-3.0-or-later
extends Node3D
var light := SpotLight3D.new()
var guide := MeshInstance3D.new()
var lens := StandardMaterial3D.new()
func _ready() -> void:
 light.spot_range=30.0;add_child(light)
 var metal := StandardMaterial3D.new();metal.albedo_color=Color("202735");metal.metallic=0.7
 var body := MeshInstance3D.new();var barrel := CylinderMesh.new()
 barrel.top_radius=0.16;barrel.bottom_radius=0.19;barrel.height=0.32
 body.mesh=barrel;body.material_override=metal;body.rotation.x=PI/2;add_child(body)
 var front := MeshInstance3D.new();var disk := CylinderMesh.new()
 disk.top_radius=0.14;disk.bottom_radius=0.14;disk.height=0.012
 front.mesh=disk;front.rotation.x=PI/2;front.position.z=-0.17
 lens.emission_enabled=true;front.material_override=lens;add_child(front)
 for side in [-1,1]:
  var yoke := MeshInstance3D.new();var box := BoxMesh.new();box.size=Vector3(0.035,0.28,0.05)
  yoke.mesh=box;yoke.material_override=metal;yoke.position=Vector3(side*0.22,0.10,0);add_child(yoke)
 var beam := CylinderMesh.new()
 beam.top_radius=0.002;beam.bottom_radius=0.002;beam.height=1.2
 guide.mesh=beam;guide.rotation.x=PI/2;guide.position.z=-0.8
 var mat := StandardMaterial3D.new();mat.shading_mode=BaseMaterial3D.SHADING_MODE_UNSHADED;mat.albedo_color=Color("ffc986")
 guide.material_override=mat;add_child(guide)
func update_color(color: Color) -> void:
 lens.albedo_color=color;lens.emission=color;lens.emission_energy_multiplier=0.8
