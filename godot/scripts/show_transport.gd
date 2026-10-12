# SPDX-License-Identifier: GPL-3.0-or-later
extends RefCounted
# This worker owns the socket and only reads stable native audio rings.
var thread := Thread.new()
var mutex := Mutex.new()
var native
var url := ""
var quitting := false
var state := WebSocketPeer.STATE_CONNECTING
var buffered := 0
var scene := ""
var room_state := ""
var room_revision := 0
var consumed_revision := -1
var cached_room := {}
var commands := []
var assets := []
var sent_assets := {}
func queue_asset(text: String) -> void:
 var data: Variant = JSON.parse_string(text)
 mutex.lock()
 if not sent_assets.has(data.id) and assets.size()<64:
  assets.append(text);sent_assets[data.id]=true
 mutex.unlock()
func connect_to_url(address: String) -> int:
 url=address
 return OK
func start(engine) -> void:
 if thread.is_started(): return
 native=engine
 thread.start(_run)
func get_ready_state() -> int:
 mutex.lock();var value=state;mutex.unlock();return value
func get_current_outbound_buffered_amount() -> int:
 mutex.lock();var value=buffered;mutex.unlock();return value
func send_text(text: String) -> void:
 mutex.lock();scene=text;mutex.unlock()
func room_snapshot() -> Dictionary:
 mutex.lock();var text=room_state;var revision=room_revision;mutex.unlock()
 if revision != consumed_revision:
  var data: Variant = JSON.parse_string(text) if not text.is_empty() else {}
  cached_room = data if data is Dictionary else {}
  consumed_revision = revision
 return cached_room
func send_command_text(text: String) -> void:
 mutex.lock()
 if commands.size()<16: commands.append(text)
 mutex.unlock()
func close() -> void:
 mutex.lock();quitting=true;mutex.unlock()
 if thread.is_started():thread.wait_to_finish()
 native=null
func _run() -> void:
 var socket := WebSocketPeer.new()
 socket.outbound_buffer_size=1048576
 socket.inbound_buffer_size=1048576
 socket.connect_to_url(url)
 while true:
  mutex.lock();var done=quitting;var update=scene;scene="";mutex.unlock()
  if done:break
  socket.poll()
  while socket.get_available_packet_count()>0:
   var packet := socket.get_packet()
   if socket.was_string_packet():
    var text := packet.get_string_from_utf8()
    if text.begins_with('{"type":"room"'):
     mutex.lock();room_state=text;room_revision+=1;mutex.unlock()
  var current=socket.get_ready_state()
  mutex.lock();state=current;buffered=socket.get_current_outbound_buffered_amount();mutex.unlock()
  if current==WebSocketPeer.STATE_CLOSED:break
  if current==WebSocketPeer.STATE_OPEN and not update.is_empty() and socket.get_current_outbound_buffered_amount()<65536:socket.send_text(update)
  if current==WebSocketPeer.STATE_OPEN and socket.get_current_outbound_buffered_amount()<65536:
   mutex.lock();var command=commands.pop_front() if not commands.is_empty() else "";mutex.unlock()
   if not command.is_empty():socket.send_text(command)
  var audio:PackedByteArray=native.show_audio_network()
  if not audio.is_empty() and current==WebSocketPeer.STATE_OPEN and socket.get_current_outbound_buffered_amount()<65536:socket.send(audio)
  if current==WebSocketPeer.STATE_OPEN and socket.get_current_outbound_buffered_amount()<16384:
   mutex.lock();var upload = assets.pop_front() if not assets.is_empty() else "";mutex.unlock()
   if not upload.is_empty():socket.send_text(upload)
  OS.delay_usec(8000)
 socket.close()
 mutex.lock();state=WebSocketPeer.STATE_CLOSED;mutex.unlock()
