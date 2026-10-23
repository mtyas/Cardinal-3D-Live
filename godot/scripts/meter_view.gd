# SPDX-License-Identifier: GPL-3.0-or-later
extends MeshInstance3D
var meter_material: ShaderMaterial
func setup(control: Dictionary) -> void:
	var quad := QuadMesh.new()
	quad.size = Vector2(float(control.width), float(control.height)) * .002
	mesh = quad
	position = Vector3(float(control.x)*.002,-float(control.y)*.002,.009)
	cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	var shader := Shader.new()
	shader.code = """shader_type spatial;
render_mode unshaded, cull_disabled;
uniform vec4 levels=vec4(0.0);
uniform vec2 holds=vec2(0.0);
uniform float gap=0.125;
uniform float red=0.7937;
uniform vec3 peak_color=vec3(0.2,0.5,0.25);
uniform vec3 rms_color=vec3(0.4,0.95,0.45);
void fragment(){
 float x=UV.x;float y=1.0-UV.y;bool right=x>0.5;
 float peak=right?levels.y:levels.x;float rms=right?levels.w:levels.z;float hold=right?holds.y:holds.x;
 vec3 color=vec3(0.015);bool bar=abs(x-.5)>gap*.5;
 if(bar&&y<peak)color=peak_color;
 if(bar&&y<rms)color=rms_color;
 if(bar&&y<peak&&y>red)color=mix(vec3(.9,.75,.1),vec3(1.0,.1,.08),clamp((y-red)/max(.01,1.0-red),0.0,1.0));
 if(bar&&hold>.001&&abs(y-hold)<.003)color=max(color,rms_color);
 ALBEDO=color;
}"""
	meter_material=ShaderMaterial.new();meter_material.shader=shader;material_override=meter_material
	meter_material.set_shader_parameter("gap",float(control.get("gap",.125)))
	meter_material.set_shader_parameter("red",float(control.get("red",.7937)))
	for key in ["peak_color","rms_color"]:
		var rgb: Array=control.get(key,[.4,.95,.45])
		meter_material.set_shader_parameter(key,Vector3(rgb[0],rgb[1],rgb[2]))
	update_values(control)
func update_values(control: Dictionary) -> void:
	visible=bool(control.get("visible",true))
	var v: Array=control.get("levels",[0,0,0,0,0,0])
	meter_material.set_shader_parameter("levels",Vector4(v[0],v[1],v[2],v[3]))
	meter_material.set_shader_parameter("holds",Vector2(v[4],v[5]))
