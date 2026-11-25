"""Independently verify exported scan data against the complete original GLB."""
import bpy,bmesh,json,os,math,numpy as np
from mathutils import Vector,kdtree
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'../..'));OUT=os.path.join(ROOT,'assets/crucian-scan')
def read_classic(name):
    text=open(os.path.join(ROOT,'src',name)).read();return json.JSONDecoder().raw_decode(text.split('const data=',1)[1])[0]
asset=read_classic('crucian-mesh.js');body=read_classic('fish-body.js');summary=json.load(open(os.path.join(OUT,'model-summary.json')))
assert asset['modelHash']==body['modelHash'];assert asset['deformation']==body['deformation']
m=asset['meshes'][0];P=np.array(m['positions']).reshape(-1,3);N=np.array(m['normals']).reshape(-1,3);UV=np.array(m['uvs']).reshape(-1,2)
assert P.shape==N.shape and len(P)==len(UV) and len(P)%3==0
assert 10000<=len(P)//3<=25000 and np.isfinite(P).all() and np.isfinite(N).all() and np.isfinite(UV).all()
assert asset['mouthLocal']==body['mouthLocal']==[0,0,0]
lip=P[asset['mouthSource']['vertexIndices']];mouth_error=float(np.linalg.norm(lip.mean(axis=0)));assert mouth_error<1e-7
normal_error=float(np.max(abs(np.linalg.norm(N,axis=1)-1)));assert normal_error<1e-4
H=np.array(body['points']).reshape(-1,3);Q=np.array(body['surfacePoints']).reshape(-1,3)
# Independent hull reconstructed from the public support data.
bm=bmesh.new()
for p in H:bm.verts.new(p)
result=bmesh.ops.convex_hull(bm,input=list(bm.verts),use_existing_faces=False)
bmesh.ops.delete(bm,geom=list(set(result.get('geom_interior',[])+result.get('geom_unused',[]))),context='VERTS')
bmesh.ops.triangulate(bm,faces=list(bm.faces));center=H.mean(axis=0);planes=[];triangles=[]
for f in bm.faces:
    a,b,c=[np.array(v.co) for v in f.verts];n=np.cross(b-a,c-a);length=np.linalg.norm(n)
    if length<1e-15:continue
    n/=length
    if np.dot(center-a,n)>0:n=-n
    planes.append([*n,float(np.max(H@n))]);triangles.append((Vector(a),Vector(b),Vector(c)))
bm.free();planes=np.array(planes)
# Compare the entire native imported source, with no deliberate source simplification.
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=os.path.join(ROOT,'assets/candidates/research-ffish-ccd31440/model.glb'))
original=[];excluded=[]
for ob in bpy.context.scene.objects:
    if ob.type!='MESH':continue
    if len(ob.data.polygons)<100:excluded.append(dict(name=ob.name,triangles=len(ob.data.polygons)));continue
    original.extend(tuple(ob.matrix_world@v.co) for v in ob.data.vertices)
S=np.array(original);scale=.18/(S[:,0].max()-S[:,0].min());S=np.stack((-S[:,0],S[:,2],S[:,1]),axis=1)*scale-np.array(summary['mouthSourcePreTranslation'])
# Support of A Minkowski [-3mm,+3mm]Z is support(A,n)+3mm*abs(n.z).
source_overrun=-1.;render_overrun=-1.
u=np.clip((-P[:,0]-.03)/.15,0,1)
for start in range(0,len(planes),24):
    batch=planes[start:start+24];nn=batch[:,:3].T;d=batch[:,3]
    source_overrun=max(source_overrun,float(np.max(np.max(S@nn,axis=0)+.003*abs(batch[:,2])-d)))
    render_overrun=max(render_overrun,float(np.max(np.max(P@nn+(.003*u*u)[:,None]*abs(batch[:,2]),axis=0)-d)))
print('BOUNDS_DEBUG',dict(sourceMin=S.min(axis=0).tolist(),sourceMax=S.max(axis=0).tolist(),hullMin=H.min(axis=0).tolist(),hullMax=H.max(axis=0).tolist(),sourceOverrun=source_overrun,renderOverrun=render_overrun))
assert source_overrun<1e-6,(source_overrun,'source scan or continuous sweep escaped hull')
assert render_overrun<1e-6,(render_overrun,'render mesh or continuous sweep escaped hull')
# Sample all reconstructed hull triangles and independently search nearest surface support.
kd=kdtree.KDTree(len(Q))
for i,p in enumerate(Q):kd.insert(p,i)
kd.balance();max_nearest=0.;tested=0
for a,b,c in triangles:
    subdivisions=max(1,math.ceil(max((a-b).length,(b-c).length,(c-a).length)/.003))
    for i in range(subdivisions+1):
        for j in range(subdivisions+1-i):
            p=a+(b-a)*(i/subdivisions)+(c-a)*(j/subdivisions);_,_,distance=kd.find(p);max_nearest=max(max_nearest,distance);tested+=1
assert max_nearest<.00302,(max_nearest,'surface coverage exceeded approximately 3mm')
# Scan topology, not fabricated watertightness claims.
bpy.ops.wm.open_mainfile(filepath=os.path.join(OUT,'silver-crucian.blend'));ob=bpy.data.objects['Silver_crucian_scan'];me=ob.data
bm=bmesh.new();bm.from_mesh(me);boundary=sum(e.is_boundary for e in bm.edges);nonmanifold=sum(not e.is_manifold for e in bm.edges);loose=sum(len(v.link_faces)==0 for v in bm.verts)
seen=set();components=[]
for v in bm.verts:
    if v in seen:continue
    queue=[v];seen.add(v);count=0
    while queue:
        q=queue.pop();count+=1
        for e in q.link_edges:
            other=e.other_vert(q)
            if other not in seen:seen.add(other);queue.append(other)
    components.append(count)
bm.free()
report=dict(passed=True,id=asset['id'],modelHash=asset['modelHash'],source='real ccd31440 scanned fish; never procedurally rebuilt',renderTriangles=len(P)//3,renderUniqueVertices=len(me.vertices),isolatedSingleTriangleDebrisRemoved=summary['isolatedSingleTriangleDebrisRemoved'],renderBoundsMin=P.min(axis=0).tolist(),renderBoundsMax=P.max(axis=0).tolist(),renderExtent=np.ptp(P,axis=0).tolist(),actualLipVertexIndices=asset['mouthSource']['vertexIndices'],actualLipCentroidError=mouth_error,normalLengthMaxError=normal_error,uvFinite=True,photographicTexture=summary['texture'],colorCardExcluded=excluded,allOriginalImportedVerticesTested=len(S),collisionSupportCount=len(H),surfaceSampleCount=len(Q),skin=body['skin'],continuousTailSway=body['deformation'],continuousEnvelope=body['source'],constructionPadding=body['constructionPadding'],maximumOriginalSweptHullOverrun=source_overrun,maximumRenderedContinuouslySweptHullOverrun=render_overrun,quantizationTolerance=1e-6,independentSurfaceProbeCount=tested,maximumSurfaceProbeToSampleDistance=max_nearest,provenSurfaceCoverageBound=body['surfaceCoverageBound'],boundaryEdges=boundary,nonmanifoldEdges=nonmanifold,looseVertices=loose,connectedComponentVertexCounts=sorted(components,reverse=True),topologyNote='Photogrammetry scan may have pre-existing nonmanifold seams; not represented as watertight CAD.')
with open(os.path.join(OUT,'geometry-qa.json'),'w') as fp:json.dump(report,fp,indent=2)
print('GEOMETRY_QA',json.dumps(report))
