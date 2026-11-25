"""Render-only crop with marks on the actual exported lip vertices."""
import bpy,bmesh,json,os
from mathutils import Vector
ROOT=os.path.dirname(__file__)
bpy.ops.wm.open_mainfile(filepath=os.path.join(ROOT,'silver-crucian.blend'))
summary=json.load(open(os.path.join(ROOT,'model-summary.json')))
ob=bpy.data.objects['Silver_crucian_scan']
print('NORMAL_DATA',ob.data.has_custom_normals,[a.name for a in ob.data.attributes])
# Cyan dots sit exactly at scan vertices. The orange dot is their measured centroid.
mat=bpy.data.materials.new('Actual lip vertices');mat.use_nodes=True;mat.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(0,.7,.8,1);mat.node_tree.nodes.get('Principled BSDF').inputs['Emission Color'].default_value=(0,.7,.8,1);mat.node_tree.nodes.get('Principled BSDF').inputs['Emission Strength'].default_value=.5
for i in summary['mouthSource']['sourceVertexIndices']:
    p=ob.data.vertices[i].co.copy();bpy.ops.mesh.primitive_uv_sphere_add(segments=8,ring_count=4,radius=.00013,location=p);bpy.context.object.data.materials.append(mat)
mat2=bpy.data.materials.new('Measured mouth centroid');mat2.use_nodes=True;mat2.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(1,.2,.01,1);mat2.node_tree.nodes.get('Principled BSDF').inputs['Emission Color'].default_value=(1,.2,.01,1);mat2.node_tree.nodes.get('Principled BSDF').inputs['Emission Strength'].default_value=.5
bpy.ops.mesh.primitive_uv_sphere_add(segments=8,ring_count=4,radius=.0002,location=(0,0,0));bpy.context.object.data.materials.append(mat2)
bm=bmesh.new();bm.from_mesh(ob.data);bmesh.ops.delete(bm,geom=[v for v in bm.verts if v.co.x<-.014],context='VERTS');bm.to_mesh(ob.data);bm.free()
