import bpy,json,os
from mathutils import Vector
OUT=os.path.dirname(__file__)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=os.path.join(OUT,'silver-crucian.glb'))
objects=[ob for ob in bpy.context.scene.objects if ob.type=='MESH'];assert len(objects)==1
ob=objects[0];changed=ob.data.validate(verbose=True,clean_customdata=False);assert not changed,'Exported GLB needed structural repair'
triangles=sum(len(p.vertices)-2 for p in ob.data.polygons);assert triangles==json.load(open(os.path.join(OUT,'model-summary.json')))['counts']['triangles']
P=[ob.matrix_world@v.co for v in ob.data.vertices];dimensions=[max(p[k] for p in P)-min(p[k] for p in P) for k in range(3)]
assert abs(dimensions[0]-.1799898)<1e-6
report=dict(passed=True,meshCount=1,triangles=triangles,vertices=len(P),dimensionsBlender=dimensions,structuralRepairRequired=changed,materials=[m.name for m in ob.data.materials])
with open(os.path.join(OUT,'glb-reimport-qa.json'),'w') as fp:json.dump(report,fp,indent=2)
print('GLB_REIMPORT_QA',json.dumps(report))
