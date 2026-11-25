"""Import actual ffish.asia silver-crucian scan. No synthetic anatomy.
Blender Z-up preview; export transforms to Three +X head/+Y back/+Z side.
"""
import bpy,bmesh,json,os,math,base64,hashlib,sys
sys.path.insert(0,'/Users/zouqi/.dsh/skills/blender-modeling')
from mathutils import Vector,Matrix
from blkit import reset_scene
reset_scene(scale_length=1,length_unit='METERS')
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'..'))
OUT=os.path.join(ROOT,'assets/crucian-scan');os.makedirs(OUT,exist_ok=True)
bpy.ops.import_scene.gltf(filepath=os.path.join(ROOT,'assets/candidates/research-ffish-ccd31440/model.glb'))
fish=[];removed=[]
for ob in list(bpy.context.scene.objects):
    if ob.type!='MESH':continue
    if len(ob.data.polygons)<100:
        removed.append(dict(name=ob.name,faces=len(ob.data.polygons)));bpy.data.objects.remove(ob,do_unlink=True);continue
    world=ob.matrix_world.copy();ob.parent=None;ob.matrix_world=Matrix.Identity(4);ob.data.transform(world);fish.append(ob)
bpy.ops.object.select_all(action='DESELECT')
for ob in fish:ob.select_set(True)
bpy.context.view_layer.objects.active=fish[0];bpy.ops.object.join();fish=fish[0];fish.name='Silver_crucian_scan'
# Source X points to tail, Z points dorsal. Turn through Z for +X head in Blender.
pts=[v.co.copy() for v in fish.data.vertices];lo=min(p.x for p in pts);hi=max(p.x for p in pts);scale=.18/(hi-lo)
for v in fish.data.vertices:v.co=Vector((-v.co.x*scale,-v.co.y*scale,v.co.z*scale))
bm=bmesh.new();bm.from_mesh(fish.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-7);bm.to_mesh(fish.data);bm.free();fish.data.update()
print('CLEANED',len(fish.data.vertices),len(fish.data.polygons),'scale',scale,'removed',removed)
source_points=[v.co.copy() for v in fish.data.vertices]
bake_source=fish.copy();bake_source.data=fish.data.copy();bpy.context.collection.objects.link(bake_source);bake_source.name='Original_high_resolution_photo_scan';bake_source.hide_render=True;bake_source.hide_set(True)
# A vertex-group protects the real open lip while collapsing less salient scan microfacets.
vg=fish.vertex_groups.new(name='Protect_real_open_mouth')
vg.add([v.index for v in fish.data.vertices if v.co.x>.074],1,'REPLACE')
mod=fish.modifiers.new('Preserve scanned silhouette at 20k triangles','DECIMATE');mod.ratio=.054
mod.use_collapse_triangulate=True;mod.vertex_group=vg.name;mod.invert_vertex_group=True;mod.vertex_group_factor=10
bpy.context.view_layer.objects.active=fish;bpy.ops.object.modifier_apply(modifier=mod.name)
# Imported split normals are not valid after topology changes; regenerate smooth normals.
if 'custom_normal' in fish.data.attributes:fish.data.attributes.remove(fish.data.attributes['custom_normal'])
fish.data.validate(verbose=True,clean_customdata=True)
# Remove isolated single-triangle scan/decimation debris, never multi-face fins.
bm=bmesh.new();bm.from_mesh(fish.data);seen=set();debris=[];removed_fragments=0
for v in bm.verts:
    if v in seen:continue
    component=[];pending=[v];seen.add(v)
    while pending:
        q=pending.pop();component.append(q)
        for edge in q.link_edges:
            other=edge.other_vert(q)
            if other not in seen:seen.add(other);pending.append(other)
    if len(component)<=3:
        debris.extend(component);removed_fragments+=1
if debris:bmesh.ops.delete(bm,geom=debris,context='VERTS')
bm.to_mesh(fish.data);bm.free()
for p in fish.data.polygons:p.use_smooth=True
fish.data.update()
# Pick actual forward lip surface vertices around the open aperture, not a marker.
# Ellipse gates are measured on the imported scan, in metres after the rigid transform.
center_y,center_z=-.0013,-.0032
candidates=[]
for v in fish.data.vertices:
    dy=(v.co.y-center_y)/.0038;dz=(v.co.z-center_z)/.0027;r=math.hypot(dy,dz)
    if v.co.x>.0745 and .65<r<1.6:candidates.append((v,math.atan2(dz,dy)))
rim_ids=[]
for j in range(16):
    a=j*math.tau/16;pool=[v for v,t in candidates if abs(math.atan2(math.sin(t-a),math.cos(t-a)))<math.pi/16]
    if not pool:
        pool=sorted((v for v,t in candidates),key=lambda v:abs(math.atan2(math.sin(math.atan2((v.co.z-center_z)/.0027,(v.co.y-center_y)/.0038)-a),math.cos(math.atan2((v.co.z-center_z)/.0027,(v.co.y-center_y)/.0038)-a))))[:3]
    rim_ids.append(max(pool,key=lambda v:v.co.x).index)
rim_ids=list(dict.fromkeys(rim_ids));mouth=sum((fish.data.vertices[i].co for i in rim_ids),Vector())/len(rim_ids)
for v in fish.data.vertices:v.co-=mouth
source_points=[p-mouth for p in source_points]
for v in bake_source.data.vertices:v.co-=mouth
fish.data.update();print('REDUCED',len(fish.data.vertices),len(fish.data.polygons),'actualLipIndices',rim_ids,'mouth source',list(mouth))
# Convex collision hull comes from ALL original scan vertices, before decimation.
bm=bmesh.new()
for p in source_points+[v.co.copy() for v in fish.data.vertices]:bm.verts.new(p)
bm.verts.ensure_lookup_table();h=bmesh.ops.convex_hull(bm,input=list(bm.verts),use_existing_faces=False)
bmesh.ops.delete(bm,geom=list(set(h.get('geom_interior',[])+h.get('geom_unused',[]))),context='VERTS')
bmesh.ops.triangulate(bm,faces=list(bm.faces));bm.verts.ensure_lookup_table();bm.verts.index_update()
hull=[v.co.copy() for v in bm.verts];hfaces=[[v.index for v in f.verts] for f in bm.faces];bm.free()
# Minkowski sum with full local-Z +/-3mm segment contains the entire continuous tail sway.
# Blender local Y maps to Three local -Z; signs are immaterial for the symmetric sweep.
bm=bmesh.new()
for p in hull:
    for sx in (-1,1):
        for sy in (-1,1):
            for sz in (-1,1):bm.verts.new(p+Vector((sx*.0001,sy*.0031,sz*.0001)))
sweep=bmesh.ops.convex_hull(bm,input=list(bm.verts),use_existing_faces=False)
bmesh.ops.delete(bm,geom=list(set(sweep.get('geom_interior',[])+sweep.get('geom_unused',[]))),context='VERTS')
bmesh.ops.triangulate(bm,faces=list(bm.faces));bm.verts.ensure_lookup_table();bm.verts.index_update()
hull=[v.co.copy() for v in bm.verts];hfaces=[[v.index for v in f.verts] for f in bm.faces];bm.free()
deformation=dict(amplitude=.003,startX=-.03,span=.15,frequency=7,phase=4)
# Three coordinates (x,z,-y) from our already-oriented Blender mesh.
def xyz(p):return [round(p.x,7),round(p.z,7),round(-p.y,7)]
flat=lambda ps:[c for p in ps for c in xyz(p)]
samples={};grid={};radius=.002
# Poisson prune thin hull triangles: <=2mm removed-sample distance.
# Initial barycentric cells have edge <=1.7mm: coverage <=2+1.7/sqrt(3) <3mm.
def add_sample(p,force=False):
    key=tuple(math.floor(q/radius) for q in p)
    if not force:
        for dx in (-1,0,1):
            for dy in (-1,0,1):
                for dz in (-1,0,1):
                    for q in grid.get((key[0]+dx,key[1]+dy,key[2]+dz),[]):
                        if (q-p).length_squared<radius*radius:return
    k=tuple(round(q,7) for q in p)
    if k not in samples:samples[k]=p;grid.setdefault(key,[]).append(p)
for p in hull:add_sample(p,True)
for f in hfaces:
    a,b,c=[hull[i] for i in f];n=max(1,math.ceil(max((a-b).length,(b-c).length,(c-a).length)/.0017))
    for i in range(n+1):
        for j in range(n+1-i):add_sample(a+(b-a)*(i/n)+(c-a)*(j/n))
# Transfer the original photo albedo onto the reduced surface, instead of allowing
# decimation to smear its original photogrammetry atlas across collapsed triangles.
# EMIT selected-to-active bake transfers only photographed colour, never lighting.
source_mat=fish.data.materials[0].copy();nodes=source_mat.node_tree.nodes;links=source_mat.node_tree.links
source_images=[n.image for n in nodes if n.type=='TEX_IMAGE' and n.image];assert source_images
source_images[0].filepath_raw=os.path.join(OUT,'original-scanned-albedo.png');source_images[0].file_format='PNG';source_images[0].save()
source_tex=next(n for n in nodes if n.type=='TEX_IMAGE' and n.image==source_images[0])
em=nodes.new('ShaderNodeEmission');links.new(source_tex.outputs['Color'],em.inputs['Color']);links.new(em.outputs[0],next(n for n in nodes if n.type=='OUTPUT_MATERIAL').inputs['Surface'])
bake_source.data.materials.clear();bake_source.data.materials.append(source_mat)
material=bpy.data.materials.new('Photographic_albedo_reprojected_not_repainted');material.use_nodes=True
material.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value=.64
material.node_tree.nodes.get('Principled BSDF').inputs['Metallic'].default_value=.05
image=bpy.data.images.new('Baked_original_photographic_albedo',width=1024,height=1024,alpha=True,float_buffer=False);image.colorspace_settings.name='sRGB'
tex=material.node_tree.nodes.new('ShaderNodeTexImage');tex.image=image;material.node_tree.nodes.active=tex
material.node_tree.links.new(tex.outputs['Color'],material.node_tree.nodes.get('Principled BSDF').inputs['Base Color'])
fish.data.materials.clear();fish.data.materials.append(material)
bpy.ops.object.select_all(action='DESELECT');fish.select_set(True);bpy.context.view_layer.objects.active=fish
bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(angle_limit=math.radians(66),island_margin=.012,area_weight=.15);bpy.ops.object.mode_set(mode='OBJECT')
bake_source.hide_set(False);bake_source.hide_render=False;bake_source.select_set(True)
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=1
scene.render.bake.use_selected_to_active=True;scene.render.bake.use_clear=True;scene.render.bake.cage_extrusion=.0006;scene.render.bake.max_ray_distance=.0018;scene.render.bake.margin=8
bpy.ops.object.bake(type='EMIT')
bpy.data.objects.remove(bake_source,do_unlink=True)
for empty in list(bpy.context.scene.objects):
    if empty.type=='EMPTY':bpy.data.objects.remove(empty,do_unlink=True)
image.filepath_raw=os.path.join(OUT,'scanned-albedo.png');image.file_format='PNG';image.save();image.pack()
# Decode saved PNG bytes (not Blender's linear float buffer) for exact sRGB RGBA.
import struct,zlib
raw=open(image.filepath_raw,'rb').read();off=8;compressed=b''
while off<len(raw):
    size=struct.unpack_from('>I',raw,off)[0];kind=raw[off+4:off+8];data=raw[off+8:off+8+size];off+=12+size
    if kind==b'IHDR':w,h,depth,ct,_,_,interlace=struct.unpack('>IIBBBBB',data)
    if kind==b'IDAT':compressed+=data
assert depth==8 and ct==6 and interlace==0,(depth,ct,interlace)
stream=zlib.decompress(compressed);stride=w*4;rows=[];prev=bytearray(stride);offset=0
for y in range(h):
    filt=stream[offset];offset+=1;row=bytearray(stream[offset:offset+stride]);offset+=stride
    for x in range(stride):
        a=row[x-4] if x>=4 else 0;b=prev[x];c=prev[x-4] if x>=4 else 0
        if filt==1:prediction=a
        elif filt==2:prediction=b
        elif filt==3:prediction=(a+b)//2
        elif filt==4:
            p=a+b-c;pa,pb,pc=abs(p-a),abs(p-b),abs(p-c);prediction=a if pa<=pb and pa<=pc else b if pb<=pc else c
        else:prediction=0
        row[x]=(row[x]+prediction)&255
    rows.append(bytes(row));prev=row
rgba=b''.join(reversed(rows))
textures=[dict(width=image.size[0],height=image.size[1],channels=4,encoding='base64-rgba8',colorSpace='srgb',flipY=False,data=base64.b64encode(rgba).decode('ascii'))]
me=fish.data;me.calc_loop_triangles();positions=[];normals=[];uvs=[];first={}
for tri in me.loop_triangles:
    for li in tri.loops:
        loop=me.loops[li];vi=loop.vertex_index;first.setdefault(vi,len(positions)//3)
        positions+=xyz(me.vertices[vi].co);normals+=xyz(me.vertices[vi].normal)
        uvs += [round(q,7) for q in me.uv_layers.active.data[li].uv]
modelhash=hashlib.sha256(json.dumps(positions,separators=(',',':')).encode()+rgba).hexdigest()
source=dict(id='ccd3144068d34cd9b15f3c38d2fb790b',author='ffish.asia / floraZia.com',license='CC BY 4.0 (conservative; current source says CC0)',url='https://sketchfab.com/3d-models/cc0-crucian-carp-c-auratus-langsdorfii-ccd3144068d34cd9b15f3c38d2fb790b',download='https://huggingface.co/datasets/allenai/objaverse/resolve/main/glbs/000-154/ccd3144068d34cd9b15f3c38d2fb790b.glb')
asset=dict(id='silver-crucian-scan-ccd31440',name='Real scanned silver crucian carp',modelHash=modelhash,units='metres',axes='+X head / +Y dorsal / +Z lateral',mouthLocal=[0,0,0],mouthSource=dict(mesh=fish.name,kind='centroid of actual scanned open lip vertices, 16 angular sectors',vertexIndices=[first[i] for i in rim_ids],sourceVertexIndices=rim_ids),textures=textures,meshes=[dict(name=fish.name,part='body',positions=positions,normals=normals,uvs=uvs,colors=[],color=[1,1,1],roughness=.64,metalness=.05,textureIndex=0)],counts=dict(meshes=1,vertices=len(positions)//3,triangles=len(positions)//9),source=source,deformation=deformation,animation='continuous local-Z tail sway; source hull swept +/-3mm bounds every phase')
body=dict(id=asset['id'],modelHash=modelhash,mouthLocal=[0,0,0],points=flat(hull),surfacePoints=flat(samples.values()),skin=.0015,sampleSpacing=.003,quantizationError=.0000001,constructionPadding=.0001,axes=asset['axes'],units='metres',deformation=deformation,surfaceCoverageBound=.002982,source='convex hull of ALL cleaned pre-decimation scan vertices AND final render vertices Minkowski +/-3mm local Z plus 0.1mm XYZ numerical padding; includes all fins and every tail-sway phase')
def classic(path,name,data):
    freeze='Object.freeze(data.points);Object.freeze(data.surfacePoints);Object.freeze(data.mouthLocal);Object.freeze(data.deformation);Object.freeze(data);' if name=='FishBody' else ''
    with open(path,'w') as fp:fp.write('/* Actual silver-crucian scan, ffish.asia / floraZia.com; CC BY 4.0. */\n(function(root){const data='+json.dumps(data,separators=(',',':'))+';'+freeze+'if(typeof module===\"object\"&&module.exports)module.exports=data;root.'+name+'=data;})(typeof window!==\"undefined\"?window:globalThis);\n')
classic(os.path.join(ROOT,'src/crucian-mesh.js'),'CrucianMesh',asset)
classic(os.path.join(ROOT,'src/fish-body.js'),'FishBody',body)
summary={k:v for k,v in asset.items() if k not in ('meshes','textures')};summary.update(sourceVertices=len(source_points),hullVertices=len(hull),surfacePointCount=len(samples),sourceTriangles=369195,colorCardRemoved=removed,isolatedSingleTriangleDebrisRemoved=removed_fragments,bboxMin=[min(p[k] for p in [xyz(v.co) for v in me.vertices]) for k in range(3)],bboxMax=[max(p[k] for p in [xyz(v.co) for v in me.vertices]) for k in range(3)],texture=dict(width=1024,height=1024,channels=4,origin='original photographic albedo projected high-to-low via EMIT bake; no procedural painting',rowOrder='bottom to top / flipY false'),mouthSourcePreTranslation=xyz(mouth))
with open(os.path.join(OUT,'model-summary.json'),'w') as fp:json.dump(summary,fp,indent=2)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,'silver-crucian.blend'))
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT,'silver-crucian.glb'),export_format='GLB',use_selection=True)
print('SCAN_EXPORT',json.dumps(summary))
