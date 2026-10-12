extends SceneTree
func _initialize() -> void: run.call_deferred()
func run() -> void:
 var session=load("res://scripts/xr_session.gd").new();root.add_child(session)
 session.headset=XRCamera3D.new();session.add_child(session.headset)
 session.ui_viewport=SubViewport.new();session.ui_viewport.size=Vector2i(1440,900);session.add_child(session.ui_viewport)
 var field := LineEdit.new();field.size=Vector2(500,60);field.placeholder_text="Chat";session.ui_viewport.add_child(field)
 var keyboard=load("res://scripts/xr_keyboard.gd").new();session.add_child(keyboard);keyboard.setup(session)
 await process_frame;await process_frame
 keyboard.open_for(field);assert(keyboard.visible and not keyboard.collision.disabled)
 keyboard.type_character('H');keyboard.type_character('I');assert(field.text=='hi')
 field.select_all();keyboard.shifted=true;keyboard.type_character('Q');assert(field.text=='Q')
 keyboard.backspace();assert(field.text.is_empty())
 keyboard.shifted=false
 var button: Button=keyboard.buttons.filter(func(b): return b.get_meta('original')=='A')[0]
 var pixel := button.get_global_rect().get_center();keyboard.pointer(pixel,true);keyboard.pointer(pixel,false);assert(field.text=='a')
 keyboard.symbols=true;keyboard.type_character('1');assert(field.text=='a!')
 var submitted := []
 field.text_submitted.connect(func(text): submitted.append(text))
 keyboard.submit();assert(submitted==['a!'] and not keyboard.visible and keyboard.collision.disabled)
 field.text='';field.caret_column=0;field.grab_focus();field.edit()
 var physical := InputEventKey.new();physical.pressed=true;physical.keycode=KEY_B;physical.unicode=98
 assert(keyboard.forward_physical_key(physical));assert(field.text=='b','Physical typing must reach the VR text field')
 physical.keycode=KEY_BACKSPACE;physical.unicode=0;assert(keyboard.forward_physical_key(physical));assert(field.text.is_empty())
 physical.keycode=KEY_C;physical.unicode=99;keyboard.forward_physical_key(physical)
 physical.keycode=KEY_ENTER;physical.unicode=0;keyboard.forward_physical_key(physical)
 assert(submitted==['a!','c'],'Physical Enter must submit to the same chat channel')
 var dialog := FileDialog.new();dialog.use_native_dialog=false;session.ui_viewport.add_child(dialog);dialog.file_mode=FileDialog.FILE_MODE_SAVE_FILE;dialog.popup_centered(Vector2i(800,600))
 await process_frame
 var filename := dialog.get_line_edit();keyboard.open_for(filename);filename.text='';filename.caret_column=0;keyboard.symbols=false
 keyboard.type_character('T');keyboard.type_character('E');keyboard.type_character('S');keyboard.type_character('T');assert(filename.text=='test')
 filename.grab_focus();filename.edit()
 physical.keycode=KEY_Z;physical.unicode=122
 assert(keyboard.forward_physical_key(physical));assert(filename.text=='testz','Physical keyboard must choose the filename field over the chat behind the dialog')
 keyboard.dismiss();assert(not keyboard.visible)
 print('Physical keyboard typing/backspace/Enter and virtual keyboard selection, pointer typing, shift, symbols, backspace, submission and filenames: PASS')
 session.queue_free();await process_frame;quit()
