# SPDX-License-Identifier: GPL-3.0-or-later
extends RefCounted
static func surface(kind: String, color: Color, metallic := 0.0, roughness := 0.8) -> StandardMaterial3D:
 var image := Image.create(64,64,false,Image.FORMAT_RGB8)
 for y in range(64):
  for x in range(64):
   var noise := float((x*73+y*151+x*y*17)%97)/97.0
   var shade := 0.82+noise*0.3
   if kind=="grille": shade=0.35 if x%4<2 and y%4<2 else 0.95
   elif kind=="stone": shade=0.45 if y%16==0 or (x+(8 if (y/16)%2 else 0))%16==0 else 0.78+noise*0.35
   elif kind=="metal": shade=0.85+float(y%4)*0.035+noise*0.06
   image.set_pixel(x,y,Color(color.r*shade,color.g*shade,color.b*shade))
 var mat := StandardMaterial3D.new();mat.albedo_texture=ImageTexture.create_from_image(image);mat.metallic=metallic;mat.roughness=roughness
 return mat
