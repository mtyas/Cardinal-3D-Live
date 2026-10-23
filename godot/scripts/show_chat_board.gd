# SPDX-License-Identifier: GPL-3.0-or-later
extends Node3D
var background: MeshInstance3D
var label: Label3D
var signature := ""
var collision: CollisionShape3D
func _ready() -> void:
 background=MeshInstance3D.new();background.mesh=BoxMesh.new();background.material_override=StandardMaterial3D.new();background.material_override.shading_mode=BaseMaterial3D.SHADING_MODE_UNSHADED;add_child(background)
 var body := StaticBody3D.new();body.set_meta("show_chat_board",true);add_child(body)
 collision=CollisionShape3D.new();collision.shape=BoxShape3D.new();body.add_child(collision)
 label=Label3D.new();label.font_size=48;label.outline_size=2;label.horizontal_alignment=HORIZONTAL_ALIGNMENT_LEFT;label.vertical_alignment=VERTICAL_ALIGNMENT_TOP;label.no_depth_test=false;label.double_sided=true;add_child(label)
func apply_state(state: Dictionary, chat: Array, title: String = "") -> void:
 var v: Array=state.values
 position=Vector3(v[9],v[10],v[11]);rotation.y=deg_to_rad(v[12]);visible=float(v[13])>.5
 (background.mesh as BoxMesh).size=Vector3(v[0],v[1],.06)
 (collision.shape as BoxShape3D).size=Vector3(v[0],v[1],.06)
 if collision.disabled==visible: collision.set_deferred("disabled",not visible)
 background.material_override.albedo_color=Color(v[6],v[7],v[8])
 label.modulate=Color(v[3],v[4],v[5]);label.pixel_size=float(v[2])/48.0;label.position=Vector3(-float(v[0])/2+.1,float(v[1])/2-.1,.034)
 var next := JSON.stringify([v.slice(0,9),chat,title])
 if signature==next: return
 signature=next
 var columns := clampi(int((float(v[0])-.2)/(float(v[2])*.6)),2,150)
 var budget := clampi(int((float(v[1])-.2)/(float(v[2])*1.3)),3,82)
 var heading := PackedStringArray()
 var name_text := title if not title.is_empty() else "MAIN CHAT"
 while name_text.length()>columns:
  heading.append(name_text.substr(0,columns));name_text=name_text.substr(columns)
 heading.append(name_text)
 heading=heading.slice(0,budget-2)
 var count := budget-heading.size()-1
 var lines := PackedStringArray()
 for message: Dictionary in chat.slice(-40):
  var text := str(message.name)+": "+str(message.text)
  while text.length()>columns:
   lines.append(text.substr(0,columns));text=text.substr(columns)
  lines.append(text)
 label.text="\n".join(heading)+"\n\n"+"\n".join(lines.slice(maxi(0,lines.size()-count)))
