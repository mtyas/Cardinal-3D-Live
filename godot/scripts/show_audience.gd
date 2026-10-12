# SPDX-License-Identifier: GPL-3.0-or-later
extends Node3D
var host
var peer
var visitors := {}
var show_visitors := true
var messages: Label
var chat_input: LineEdit
var room := {}

func setup(owner_host, column: VBoxContainer, transport) -> void:
 host=owner_host;peer=transport
 var toggle := CheckButton.new();toggle.text="Show audience in the stage";toggle.button_pressed=true
 toggle.toggled.connect(func(value): show_visitors=value);column.add_child(toggle)
 messages=Label.new();messages.text="Audience chat appears here when broadcasting."
 messages.autowrap_mode=TextServer.AUTOWRAP_WORD_SMART
 column.add_child(messages)
 var input := LineEdit.new();chat_input=input;input.placeholder_text="Message to your audience";input.max_length=400
 column.add_child(input)
 var send := Button.new();send.text="Send to main chat"
 var submit = func():
  if not input.text.strip_edges().is_empty(): peer.send_command_text(JSON.stringify({"type":"chat","text":input.text}));input.clear()
 input.text_submitted.connect(func(_text): submit.call())
 send.pressed.connect(submit);column.add_child(send)

func receive(data: Dictionary) -> void:
 room=data
 var present := {}
 for member: Dictionary in data.get("members",[]):
  if member.get("role")=="performer": continue
  var id := str(member.id);present[id]=true
  if not visitors.has(id):
   var node := Node3D.new();add_child(node)
   var sphere := MeshInstance3D.new();var mesh := SphereMesh.new();mesh.radius=0.13;mesh.height=0.26;sphere.mesh=mesh
   var mat := StandardMaterial3D.new();mat.emission_enabled=true;mat.shading_mode=BaseMaterial3D.SHADING_MODE_UNSHADED;sphere.material_override=mat;node.add_child(sphere)
   var name_label := Label3D.new();name_label.position.y=0.3;name_label.font_size=36;name_label.pixel_size=0.003;name_label.billboard=BaseMaterial3D.BILLBOARD_ENABLED;node.add_child(name_label)
   visitors[id]={"node":node,"sphere":sphere,"label":name_label}
  var v: Dictionary = visitors[id]
  v.label.text=str(member.name)
  v.sphere.material_override.albedo_color=Color(str(member.color));v.sphere.material_override.emission=Color(str(member.color))
  v.node.set_meta("target",Vector3(member.position[0],member.position[1],member.position[2])+Vector3(0,-1.5 if OS.get_environment("CARDINAL_3D_XR")!="1" else 0,0))
  v.node.set_meta("reaction",member.get("reaction",{}))
 for id in visitors.keys():
  if not present.has(id): visitors[id].node.queue_free();visitors.erase(id)
 var lines := PackedStringArray()
 for entry: Dictionary in data.get("chat",[]).slice(-5): lines.append(str(entry.name)+": "+str(entry.text))
 var text := "MAIN CHAT · %d visitors\n\n" % visitors.size()+"\n\n".join(lines)
 messages.text=text

func _process(delta: float) -> void:
 for v: Dictionary in visitors.values():
  v.node.visible=show_visitors
  v.node.position=v.node.position.lerp(v.node.get_meta("target",v.node.position),1-exp(-15*delta))
  var reaction: Dictionary=v.node.get_meta("reaction",{})
  var strength := 0.0
  if not reaction.is_empty():
   var now := Time.get_unix_time_from_system()*1000
   strength=sin(PI*clampf((now-float(reaction.startedAt))/3200.0,0,1))
  v.sphere.scale=Vector3.ONE*(1+strength*(1.4 if reaction.get("kind")=="grow" else 0.18))
  v.sphere.material_override.emission_energy_multiplier=1+strength*3
