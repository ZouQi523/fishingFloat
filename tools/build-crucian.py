"""Reproducible Blender crucian carp, metres, +X head, Blender Z up.
Run through blender-modeling/scripts/blrun. Exports classic JS without loaders.
Preview uses Blender Z-up; exported buffers convert to Three Y-up (x,z,-y).
"""
import bpy, bmesh, math, json, os, base64
from mathutils import Vector
from blkit import reset_scene, material, assign_material, apply_transforms, recalc_normals
reset_scene(scale_length=1, length_unit='METERS')
OUT=os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
os.makedirs(os.path.join(OUT,'assets/crucian'),exist_ok=True)
parts=[]
def mat(name,color,rough=.48,metal=.2):
    return material(name,color,roughness=rough,metallic=metal)
bodymat=mat('Silver olive skin',(.43,.47,.39),.4,.42)
finmat=mat('Translucent warm grey fins',(.27,.30,.23),.61,.12)
raymat=mat('Fin rays',(.34,.37,.29),.55,.15)
eyeMat=mat('Small dark pupil',(.009,.014,.012),.19,.1)
irisMat=mat('Muted bronze silver iris',(.39,.40,.26),.35,.45)
lipMat=mat('Grey fleshy lips',(.39,.40,.31),.58,.08)
mouthMat=mat('Real recessed mouth cavity',(.025,.029,.021),.85,0)
gillMat=mat('Operculum crease',(.17,.21,.15),.55,.12)
def mesh(name,verts,faces,ma,kind='body',smooth=True):
    me=bpy.data.meshes.new(name); me.from_pydata(verts,[],faces); me.update()
    ob=bpy.data.objects.new(name,me); bpy.context.collection.objects.link(ob)
    assign_material(ob,ma); recalc_normals(ob)
    bm=bmesh.new();bm.from_mesh(me)
    bmesh.ops.triangulate(bm,faces=list(bm.faces))
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.normal_update()
    if bm.calc_volume(signed=True)<0:bmesh.ops.reverse_faces(bm,faces=list(bm.faces))
    bm.normal_update();bm.to_mesh(me);me.update();bm.free()
    for p in me.polygons:p.use_smooth=smooth
    ob['part']=kind;parts.append(ob);return ob
# Cross-sections from tail wrist to the open oral rim. Body is laterally compressed.
profile=[(-.066,0,.006,.003),(-.06,.000,.009,.0045),(-.052,.002,.015,.007),(-.043,.004,.023,.010),(-.03,.004,.030,.013),(-.014,.003,.034,.0145),(.004,.002,.034,.015),(.021,.001,.030,.014),(.037,0,.024,.012),(.049,0,.020,.011),(.060,.0005,.019,.0105),(.070,.0005,.017,.0096),(.078,0,.014,.008),(.083,0,.0108,.0065),(.086,0,.0075,.0049),(.088,0,.0046,.0037),(.089,0,.0029,.0029)]
N=40;v=[];f=[]
for x,c,h,w in profile:
    for j in range(N):
        a=j*2*math.pi/N;v.append((x,w*math.sin(a),c+h*math.cos(a)))
for i in range(len(profile)-1):
    for j in range(N):
        a=i*N+j;b=i*N+(j+1)%N;f.append((a,b,b+N,a+N))
f.append(tuple(reversed(range(N))))
# Mouth stays open, with a genuinely recessed inner wall and dark back, not a painted dot.
for x,h,w in [(.087,.0020,.0021),(.0845,.0018,.0019)]:
    start=len(v)
    for j in range(N):
        a=j*2*math.pi/N;v.append((x,w*math.sin(a),h*math.cos(a)))
    prev=start-N
    for j in range(N):f.append((prev+j,prev+(j+1)%N,start+(j+1)%N,start+j))
f.append(tuple(range(len(v)-N,len(v))))
body=mesh('Crucian_body',v,f,bodymat)
# Silvery flank scales: subdued per-vertex pigment variation, not oversized cartoon plates.
col=body.data.color_attributes.new(name='SkinColor',type='FLOAT_COLOR',domain='POINT')
for i,p in enumerate(body.data.vertices):
    x,y,z=p.co;d=max(0,min(1,(z+.024)/.057));belly=(.70,.70,.59);back=(.21,.26,.19)
    fl=abs(y)/.015
    wave=.025*math.sin(x*2100+math.floor((z+.04)/.004)*1.7)*math.sin(z*1500)
    base=tuple(belly[k]*(1-d)+back[k]*d+wave+fl*.075 for k in range(3))
    col.data[i].color=(*base,1)
# O-shaped, open fleshy lip with outer/inner surface; front rim x exactly +.09m.
v=[];f=[]
for x,h,w in [(.0885,.0032,.0033),(.090,.00265,.0028),(.090,.00185,.00205),(.087,.0019,.0021)]:
    for j in range(N):
        a=j*2*math.pi/N;v.append((x,w*math.sin(a),h*math.cos(a)))
for k in range(4):
    for j in range(N):f.append((k*N+j,k*N+(j+1)%N,((k+1)%4)*N+(j+1)%N,((k+1)%4)*N+j))
lip=mesh('Oral_lip_actual_rim',v,f,lipMat,'mouth')
lip['mouth_rim_start']=N;lip['mouth_rim_count']=N
# Dark oral floor behind the open lip: a closed thin solid, not a one-sided disc.
v=[(x,.0019*math.sin(j*2*math.pi/N),.0018*math.cos(j*2*math.pi/N)) for x in [.0843,.0846] for j in range(N)]
f=[tuple(reversed(range(N))),tuple(range(N,2*N))]+[(j,(j+1)%N,(j+1)%N+N,j+N) for j in range(N)]
mesh('Mouth_recess',v,f,mouthMat,'mouth')
def ellipsoid(name,loc,scale,ma,kind='detail'):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=16,ring_count=8,radius=1,location=loc)
    o=bpy.context.object;o.name=name;o.scale=scale;apply_transforms(o);assign_material(o,ma)
    for p in o.data.polygons:p.use_smooth=True
    o['part']=kind;parts.append(o);return o
for s in [-1,1]:
    ellipsoid('Eye_iris',(.073,s*.0087,.0063),(.0022,.0010,.0022),irisMat)
    ellipsoid('Eye_pupil',(.0734,s*.0095,.0064),(.00130,.00045,.00142),eyeMat)
# Watertight thin solid fins: paired polygon shells, gently tapered rays.
def tube(name,points,radius,ma,kind='detail',sides=5):
    vv=[];ff=[]
    for i,p in enumerate(points):
        p=Vector(p);t=Vector(points[min(i+1,len(points)-1)])-Vector(points[max(i-1,0)])
        t.normalize();axis=t.cross(Vector((0,1,0)))
        if axis.length<.1:axis=t.cross(Vector((0,0,1)))
        axis.normalize();other=t.cross(axis).normalized()
        for j in range(sides):vv.append(p+radius*(math.cos(j*2*math.pi/sides)*axis+math.sin(j*2*math.pi/sides)*other))
    for i in range(len(points)-1):
        for j in range(sides):ff.append((i*sides+j,i*sides+(j+1)%sides,(i+1)*sides+(j+1)%sides,(i+1)*sides+j))
    ff.append(tuple(reversed(range(sides))));ff.append(tuple(range((len(points)-1)*sides,len(points)*sides)))
    return mesh(name,vv,ff,ma,kind)
def fin(name,outline,kind='fin',thick=.00023):
    # Two sides with a centre fan ensure the forked tail's concave outline remains exact.
    # Concave polygons are triangulated by Blender's tessellator on export.
    vv=[(x,y-thick/2,z) for x,y,z in outline]+[(x,y+thick/2,z) for x,y,z in outline]
    n=len(outline);ff=[tuple(reversed(range(n))),tuple(range(n,2*n))]
    ff += [(j,(j+1)%n,(j+1)%n+n,j+n) for j in range(n)]
    return mesh(name,vv,ff,finmat,kind)
# Long single dorsal fin, gently convex leading edge and continuous low rear base.
fin('Dorsal',[(-.049,0,.019),(-.045,0,.033),(-.031,0,.045),(-.015,0,.047),(.001,0,.042),(.022,0,.028),(.026,0,.026),(.005,0,.032),(-.016,0,.037),(-.034,0,.029)],'dorsal')
def interp(x,points):
    for (a,b),(c,d) in zip(points,points[1:]):
        if a<=x<=c:return b+(d-b)*(x-a)/(c-a)
    return points[0][1] if x<points[0][0] else points[-1][1]
for i in range(13):
    x=-.042+i/12*.060
    top=interp(x,[(-.045,.033),(-.031,.045),(-.015,.047),(.001,.042),(.022,.028)])-.0005
    root=interp(x,[(p[0],p[1]+p[2]) for p in profile])-.002
    tube('Dorsal_ray',[(x+.001,0,root),(x,0,top)],.00013,raymat,'dorsal')
# Forked caudal edge, not a triangular fan.
tail=[(-.061,0,.007),(-.075,0,.016),(-.090,0,.025),(-.088,0,.014),(-.081,0,0),(-.088,0,-.015),(-.090,0,-.024),(-.075,0,-.016),(-.061,0,-.006)]
fin('Forked_caudal',tail,'caudal')
for z in [-.022,-.016,-.010,-.005,0,.005,.010,.016,.023]:
    endx=-.083-abs(z)*.27
    tube('Caudal_ray',[(-.061,0,z*.22),(-.073,0,z*.60),(endx,0,z)],.00013,raymat,'caudal')
fin('Anal',[(-.049,0,-.014),(-.050,0,-.029),(-.039,0,-.033),(-.024,0,-.029),(-.015,0,-.026),(-.025,0,-.027)],'anal')
for s in [-1,1]:
    fin('Pectoral',[(.042,s*.009,-.008),(.028,s*.022,-.013),(.011,s*.024,-.024),(.020,s*.014,-.021),(.034,s*.010,-.011)],'pectoral')
    fin('Pelvic',[(-.002,s*.009,-.025),(-.009,s*.015,-.037),(-.025,s*.014,-.037),(-.017,s*.007,-.026)],'pelvic')
    # Operculum curves follow the actual body surface, not a giant outlined circle.
    gill=[]
    for x,z in [(.048,.013),(.043,.008),(.042,-.001),(.044,-.010),(.049,-.016)]:
        c=interp(x,[(p[0],p[1]) for p in profile]);h=interp(x,[(p[0],p[2]) for p in profile]);w=interp(x,[(p[0],p[3]) for p in profile])
        gill.append((x,s*(w*math.sqrt(max(0,1-((z-c)/h)**2))+.00004),z))
    tube('Gill_cover',gill,.00023,gillMat)
    for j in range(4):
        tube('Pectoral_ray',[(.039,s*.010,-.009),(.018+j*.003,s*(.015+j*.002),-.022+j*.002)],.00011,raymat,'pectoral')
# Bake subtle overlapping scale crescents and a lateral line. This exact grayscale
# texture is packed into classic JS (not loaded from a URL) and reused in Blender.
TW,TH=512,256;gray=bytearray();pixels=[]
for j in range(TH):
    v=(j+.5)/TH;row=math.floor(v*12)
    for i in range(TW):
        u=(i+.5)/TW;shade=246
        if .06<u<.735:
            dx=(u*27+(row%2)*.5)%1-.5;dy=(v*12)%1-.5
            arc=math.sqrt((dx+.22)**2+(dy*.80)**2)
            shade=244
            if .49<arc<.55:shade=219
            elif .455<arc<=.49:shade=252
            # Interrupted, restrained lateral sensory line, not a black drawn outline.
            line=.47+.025*math.sin(u*4.5)
            if abs(v-line)<.0027:shade-=13
        gray.append(shade);q=shade/255;pixels.extend((q,q,q,1))
teximage=bpy.data.images.new('Packed_scale_lateral_line',width=TW,height=TH)
teximage.colorspace_settings.name='Non-Color';teximage.pixels.foreach_set(pixels);teximage.pack()
teximage.filepath_raw=os.path.join(OUT,'assets/crucian/skin-gray.png');teximage.file_format='PNG';teximage.save()
uv=body.data.uv_layers.new(name='ScaleUV')
for loop in body.data.loops:
    p=body.data.vertices[loop.vertex_index].co;uv.data[loop.index].uv=((p.x+.066)/.156,(p.z+.033)/.070)
# Export evaluated Blender triangle geometry into lightweight classic JS arrays.
bpy.context.view_layer.update(); exported=[]
for ob in parts:
    me=ob.data;me.calc_loop_triangles();pos=[];norm=[];colors=[];uvs=[]
    attr=me.color_attributes.get('SkinColor')
    for tri in me.loop_triangles:
        for li in tri.loops:
            loop=me.loops[li];vert=me.vertices[loop.vertex_index]
            co=ob.matrix_world@vert.co;no=(ob.matrix_world.to_3x3()@loop.normal).normalized()
            pos += [round(co.x,7),round(co.z,7),round(-co.y,7)]
            norm += [round(no.x,5),round(no.z,5),round(-no.y,5)]
            if attr:
                colors += [round(c,4) for c in attr.data[loop.vertex_index].color[:3]]
                uvs += [round(c,6) for c in me.uv_layers.active.data[li].uv]
    bs=ob.active_material.node_tree.nodes.get('Principled BSDF');rgba=bs.inputs['Base Color'].default_value
    exported.append(dict(name=ob.name,part=ob['part'],positions=pos,normals=norm,colors=colors,uvs=uvs,color=list(rgba[:3]),roughness=bs.inputs['Roughness'].default_value,metalness=bs.inputs['Metallic'].default_value))
rim=[lip.matrix_world@lip.data.vertices[i].co for i in range(N,2*N)]
# Use the same seven-decimal-metre quantization as the exported visible geometry.
center=[round(math.fsum(round(p[k],7) for p in rim)/N,9) for k in range(3)]
asset=dict(name='Blender crucian carp',units='metres',axes='+X head / +Y up / +Z left',mouthLocal=[center[0],center[2],-center[1]],mouthSource=dict(mesh=lip.name,kind='centroid of actual front oral rim',vertexCount=N),meshes=exported)
asset['skinTexture']=dict(width=TW,height=TH,encoding='base64-gray8-linear',data=base64.b64encode(gray).decode('ascii'))
asset['counts']=dict(meshes=len(exported),vertices=sum(len(m['positions'])//3 for m in exported),triangles=sum(len(m['positions'])//9 for m in exported))
with open(os.path.join(OUT,'src/crucian-mesh.js'),'w') as fp:fp.write('/* Generated by Blender: tools/build-crucian.py. No runtime fetch. */\nwindow.CrucianMesh = '+json.dumps(asset,separators=(',',':'))+';\n')
with open(os.path.join(OUT,'assets/crucian/model-summary.json'),'w') as fp:json.dump({k:v for k,v in asset.items() if k not in ('meshes','skinTexture')},fp,indent=2)
# Skin preview reads the same pigment used by Three vertex colours.
nodes=bodymat.node_tree.nodes;links=bodymat.node_tree.links;bs=nodes.get('Principled BSDF')
vc=nodes.new('ShaderNodeVertexColor');vc.layer_name='SkinColor'
it=nodes.new('ShaderNodeTexImage');it.image=teximage
mix=nodes.new('ShaderNodeMixRGB');mix.blend_type='MULTIPLY';mix.inputs[0].default_value=1
links.new(vc.outputs['Color'],mix.inputs[1]);links.new(it.outputs['Color'],mix.inputs[2]);links.new(mix.outputs['Color'],bs.inputs['Base Color'])
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,'assets/crucian/crucian.blend'))
print('CRUCIAN_EXPORT',asset['counts'],'mouthLocal',asset['mouthLocal'])
