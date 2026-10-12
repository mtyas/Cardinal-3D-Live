extends SceneTree
class Uploads extends RefCounted:
 var payloads := []
 func queue_asset(text: String) -> void: payloads.append(JSON.parse_string(text))
func _initialize() -> void: run.call_deferred()
func run() -> void:
 var host=load("res://scripts/main.gd").new();root.add_child(host);await process_frame
 var uploader=Uploads.new()
 var exporter=load("res://scripts/show_visuals.gd").new()
 for place in range(8):
  host.immersive_environment.place=place;host.immersive_environment.rebuild()
  var state: Dictionary=exporter.capture(host,uploader)
  assert(state.place==place and not state.environment.is_empty())
  var payload: Dictionary=uploader.payloads.back()
  var bytes := Marshalls.base64_to_raw(payload.data)
  assert(bytes.size()<512*1024,"Environment must fit the asset budget")
  assert(JSON.stringify(payload).to_utf8_buffer().size()<700000,"Encoded scenery must fit transport")
  var groups: Variant=JSON.parse_string(bytes.get_string_from_utf8())
  assert(groups is Array and (place==7 or not groups.is_empty()))
  if place!=7: assert(is_equal_approx(float(groups[0].transforms[0][13]),-0.12 if place in [0,3,4] else -0.22),"Shared floor must use canonical height")
 var object={"id":"11","kind":"figure","values":[1,1,1,1,1,1,2,3,-4,0,1,0],"phase":0.2,"frequency":1}
 host.show_stage._update_fixtures({"speakers":[{"id":"12","position":[2,3,-4],"yaw":0}],"lights":[],"objects":[object]})
 assert(host.show_stage.fixtures['object/11'].position.is_equal_approx(Vector3(2,1.5,-4)))
 assert(host.show_stage.fixtures['speaker/12'].position.is_equal_approx(Vector3(2,1.5,-4)))
 host.show_stage.audience.receive({"members":[{"id":"v","role":"visitor","name":"Test visitor","color":"#65e7ff","position":[2,3,-4]}],"chat":[{"name":"Test visitor","text":"Hello performer"}]})
 assert(host.show_stage.audience.visitors.size()==1)
 assert(host.show_stage.audience.messages.text.contains('Hello performer'))
 host.show_stage.audience.receive({});assert(host.show_stage.audience.visitors.is_empty())
 var board={"id":"20","values":[3,2,.065,.85,.95,1,.04,.08,.14,3,1.8,-3,0,1]}
 host.show_stage.audience.receive({"chat":[{"name":"Visitor","text":"Shared board message"}]})
 host.show_stage._update_fixtures({"speakers":[],"lights":[],"objects":[],"boards":[board]})
 var prop=host.show_stage.fixtures['board/20'];assert(prop.label.text.contains('Shared board message'));assert(prop.position.is_equal_approx(Vector3(3,.3,-3)))
 assert(prop.collision.get_parent().has_meta("show_chat_board"));assert((prop.collision.shape as BoxShape3D).size.is_equal_approx(Vector3(3,2,.06)))
 assert(prop.get_parent()==host.show_stage,"Board belongs to world, never headset")
 print("Shared coordinates, all eight environments, asset budgets and performer audience: PASS")
 host.queue_free();await process_frame;await process_frame;quit()
