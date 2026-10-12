# SPDX-License-Identifier: GPL-3.0-or-later
extends Node3D
func shape(mesh: Mesh,at: Vector3,mat: Material) -> MeshInstance3D:
 var node := MeshInstance3D.new();node.mesh=mesh;node.position=at;node.material_override=mat;add_child(node);return node
func box(size: Vector3) -> BoxMesh:
 var mesh := BoxMesh.new();mesh.size=size;return mesh
func _ready() -> void:
 var surfaces=preload("res://scripts/show_materials.gd")
 var cabinet=surfaces.surface("grain",Color("263747"),0.1,0.9)
 var grille=surfaces.surface("grille",Color("48515a"),0.55,0.55)
 var metal=surfaces.surface("metal",Color("8b969e"),0.8,0.3)
 shape(box(Vector3(.45,.7,.3)),Vector3.ZERO,cabinet)
 shape(box(Vector3(.39,.63,.009)),Vector3(0,0,-.155),grille)
 for y in [-.17,.16]:
  var cone := CylinderMesh.new();cone.top_radius=.105;cone.bottom_radius=.105;cone.height=.014;cone.radial_segments=24
  var driver=shape(cone,Vector3(0,y,-.163),cabinet);driver.rotation.x=PI/2
  var ring := TorusMesh.new();ring.inner_radius=.108;ring.outer_radius=.12;ring.rings=24;ring.ring_segments=6
  var rim=shape(ring,Vector3(0,y,-.17),metal);rim.rotation.x=PI/2
 for x in [-.175,.175]:
  for y in [-.28,.28]:
   var bolt := SphereMesh.new();bolt.radius=.009;bolt.height=.018;shape(bolt,Vector3(x,y,-.165),metal)
 for x in [-.23,.23]: shape(box(Vector3(.008,.13,.04)),Vector3(x,0,0),metal)
 var badge := StandardMaterial3D.new();badge.albedo_color=Color("65e7ff");badge.emission_enabled=true;badge.emission=badge.albedo_color
 shape(box(Vector3(.10,.014,.004)),Vector3(0,-.29,-.168),badge)
