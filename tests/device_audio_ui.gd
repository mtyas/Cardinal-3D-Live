extends SceneTree
class Backend:
 extends RefCounted
 var applied := {}
 func audio_catalog() -> Array:
  return [{"api":7,"name":"ASIO","devices":[{"id":4,"name":"RME","inputs":32,"outputs":34,"default_output":true,"rates":[44100,48000]}]}]
 func restart_audio(settings:Dictionary,_rescan:bool=false) -> bool:
  applied=settings
  return true
func _initialize() -> void:
 var b=Backend.new()
 var ui=load("res://scripts/device_audio_controls.gd").new()
 root.add_child(ui);ui.setup(b)
 assert(ui.driver.get_selected_id()==-1,"Windows default must have its explicit negative id")
 assert(ui.input_device.get_selected_id()==-1,"Off must disable capture")
 ui.driver.select(1);ui.refresh_devices()
 assert(ui.output_device.get_selected_id()==4)
 assert(ui.output_left.item_count==34)
 ui._apply()
 assert(b.applied.input_device==-1 and b.applied.input_left==-1 and b.applied.input_right==-1,"Off must reach native backend as disabled")
 assert(b.applied.output_left==0 and b.applied.output_right==1)
 ui.input_device.select(1);ui.refresh_channels();ui._apply()
 assert(b.applied.input_device==4 and b.applied.input_left==0 and b.applied.input_right==1,"First stereo input channels must be distinct from Off")
 print("Device driver, Off capture, ASIO channels and apply settings: PASS")
 ui.queue_free();quit()
