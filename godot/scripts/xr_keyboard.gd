# SPDX-License-Identifier: GPL-3.0-or-later
extends Node3D
var session
var target: LineEdit
var viewport: SubViewport
var panel: MeshInstance3D
var collision: CollisionShape3D
var preview: Label
var buttons := []
var pressed: Button
var shifted := false
var symbols := false
var watched := {}
var last_focus: Control
var scan_time := 0.0
var forwarding_key := false

func forward_physical_key(event: InputEventKey) -> bool:
 if forwarding_key or session==null: return false
 var field=focused(session.ui_viewport)
 if not field is LineEdit or not field.editable: return false
 var destination: Viewport=field.get_viewport()
 if destination==get_viewport(): return false
 forwarding_key=true
 destination.push_input(event.duplicate(),true)
 forwarding_key=false
 if event.pressed and event.keycode in [KEY_ENTER,KEY_KP_ENTER,KEY_ESCAPE]: dismiss.call_deferred()
 return true

func _input(event: InputEvent) -> void:
 if event is InputEventKey and forward_physical_key(event): get_viewport().set_input_as_handled()

func setup(owner_session) -> void:
 session=owner_session
 viewport=SubViewport.new();viewport.size=Vector2i(1200,430);viewport.transparent_bg=true;viewport.render_target_update_mode=SubViewport.UPDATE_DISABLED;add_child(viewport)
 var shell := PanelContainer.new();shell.size=Vector2(1200,430);viewport.add_child(shell)
 var margin := MarginContainer.new()
 for side in ["left","right","top","bottom"]: margin.add_theme_constant_override("margin_"+side,14)
 shell.add_child(margin)
 var column := VBoxContainer.new();column.add_theme_constant_override("separation",8);margin.add_child(column)
 preview=Label.new();preview.add_theme_font_size_override("font_size",28);column.add_child(preview)
 for row in ["1234567890", "QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"]:
  var line := HBoxContainer.new();line.add_theme_constant_override("separation",8);column.add_child(line)
  for character in row: key(line,character,func(): type_character(character))
 var actions := HBoxContainer.new();actions.add_theme_constant_override("separation",8);column.add_child(actions)
 key(actions,"Shift",func(): shifted=not shifted;refresh_keys())
 key(actions,"Symbols",func(): symbols=not symbols;refresh_keys())
 key(actions,"Space",func(): type_character(" "),2)
 key(actions,"←",func(): if is_instance_valid(target): target.caret_column=maxi(0,target.caret_column-1))
 key(actions,"→",func(): if is_instance_valid(target): target.caret_column=mini(target.text.length(),target.caret_column+1))
 key(actions,"Backspace",backspace)
 key(actions,"Enter / Send",submit,2)
 key(actions,"Close ×",dismiss)
 panel=MeshInstance3D.new();var mesh := QuadMesh.new();mesh.size=Vector2(1.0,0.358);panel.mesh=mesh
 var mat := StandardMaterial3D.new();mat.shading_mode=BaseMaterial3D.SHADING_MODE_UNSHADED;mat.transparency=BaseMaterial3D.TRANSPARENCY_ALPHA;mat.albedo_texture=viewport.get_texture();panel.material_override=mat;add_child(panel)
 var body := StaticBody3D.new();body.set_meta("xr_keyboard",true);panel.add_child(body)
 collision=CollisionShape3D.new();var box := BoxShape3D.new();box.size=Vector3(1,0.358,0.006);collision.shape=box;body.add_child(collision)
 dismiss()

func key(row: HBoxContainer, title: String, action: Callable, stretch := 1.0) -> void:
 var button := Button.new();button.text=title;button.custom_minimum_size=Vector2(0,60);button.size_flags_horizontal=Control.SIZE_EXPAND_FILL;button.size_flags_stretch_ratio=stretch;button.focus_mode=Control.FOCUS_NONE;button.add_theme_font_size_override("font_size",23)
 button.set_meta("original",title);button.pressed.connect(action);row.add_child(button);buttons.append(button)

func watch(node: Node) -> void:
 if node is LineEdit and not watched.has(node.get_instance_id()):
  watched[node.get_instance_id()]=true;node.focus_entered.connect(func(): open_for(node))
 for child in node.get_children(): watch(child)

func open_for(field: LineEdit) -> void:
 if not field.is_visible_in_tree() or not field.editable: return
 target=field;last_focus=field;visible=true;collision.disabled=false;viewport.render_target_update_mode=SubViewport.UPDATE_ALWAYS
 var facing := Basis(Vector3.UP,session.headset.global_rotation.y)
 global_transform=Transform3D(facing,session.headset.global_position+facing*Vector3(0,-0.62,-1.02))
 refresh_keys()

func open_focused() -> void:
 var field=focused(session.ui_viewport)
 if field is LineEdit: open_for(field)

func focused(node: Node) -> Control:
 # Embedded dialogs own their focus separately from the parent viewport.
 for child in node.get_children():
  if child is Window and not child.visible: continue
  var found=focused(child)
  if found!=null: return found
 if node is Viewport:
  var control=node.gui_get_focus_owner()
  if control is LineEdit and control.is_visible_in_tree(): return control
 return null

func dismiss() -> void:
 visible=false;pressed=null
 if collision!=null: collision.disabled=true
 if viewport!=null: viewport.render_target_update_mode=SubViewport.UPDATE_DISABLED

func type_character(character: String) -> void:
 if not is_instance_valid(target): return
 var original="1234567890QWERTYUIOPASDFGHJKLZXCVBNM"
 var punctuation="!@#$%^&*()[]{}<>/\\_-+=:;\"'.,?éèàçù"
 if symbols and character!=" ": character=punctuation[original.find(character)] if original.find(character)<punctuation.length() else character
 elif character!=" ": character=character if shifted else character.to_lower()
 remove_selection();target.insert_text_at_caret(character)

func remove_selection() -> void:
 if target.has_selection():
  var start := target.get_selection_from_column();var end := target.get_selection_to_column()
  target.delete_text(start,end);target.deselect();target.caret_column=start

func backspace() -> void:
 if not is_instance_valid(target): return
 if target.has_selection(): remove_selection()
 elif target.caret_column>0:
  var at := target.caret_column;target.delete_text(at-1,at);target.caret_column=at-1

func submit() -> void:
 var field=target;dismiss()
 if is_instance_valid(field): field.text_submitted.emit(field.text)

func refresh_keys() -> void:
 var original="1234567890QWERTYUIOPASDFGHJKLZXCVBNM"
 var punctuation="!@#$%^&*()[]{}<>/\\_-+=:;\"'.,?éèàçù"
 for button: Button in buttons:
  var text: String=button.get_meta("original")
  if text.length()==1 and original.contains(text):
   var index := original.find(text)
   button.text=punctuation[index] if symbols and index<punctuation.length() else text if shifted else text.to_lower()

func hit(world: Vector3) -> Dictionary:
 var local := panel.to_local(world)
 return {"kind":"keyboard","pixel":Vector2((local.x+0.5)*1200,(0.5-local.y/0.358)*430),"world":world}

func pointer(pixel: Vector2, down: bool) -> void:
 var chosen: Button
 for button: Button in buttons:
  if button.get_global_rect().has_point(pixel): chosen=button;break
 if down: pressed=chosen
 else:
  var previous=pressed;pressed=null
  if chosen!=null and chosen==previous: chosen.pressed.emit()

func _process(delta: float) -> void:
 if session==null: return
 scan_time+=delta
 if scan_time>0.4:
  scan_time=0;watch(session.ui_viewport)
  var field=focused(session.ui_viewport)
  if field!=last_focus:
   last_focus=field
   if field is LineEdit: open_for(field)
 if visible:
  if not is_instance_valid(target) or not target.is_visible_in_tree(): dismiss();return
  preview.text=(target.placeholder_text if not target.placeholder_text.is_empty() else "Type here")+"  ·  "+target.text.right(65)+" ▏"
