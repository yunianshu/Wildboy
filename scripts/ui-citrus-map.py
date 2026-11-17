"""Record the citrus revision using the actual MCP readback, preserving the previous revision."""
from pathlib import Path
import json,hashlib,shutil
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'docs/ui-refactor/2026-11-17-citrus'
old=ROOT/'docs/ui-refactor/2026-11-17'
raw=(OUT/'pen-readback.json').read_bytes()
snapshot=json.loads(raw); nodes=snapshot['nodes']; byid={n['id']:n for n in nodes}
roots=[n for n in nodes if n['depth']==0]
groups={n['id']:[] for n in roots}
for n in nodes:
 a=n
 while a.get('parent') in byid:a=byid[a['parent']]
 groups[a['id']].append(n)
inventory=json.loads((old/'inventory.json').read_text(encoding='utf8'))
for p in inventory['pages']:
 boards=[n for n in roots if (n.get('context') or n.get('metadata',{}).get('route'))==p['route']]
 assert boards,p['route']
 p['artboards']=[{'id':n['id'],'name':n['name'],'size':n['bounds'],'nodeCount':len(groups[n['id']]),'designText':[c['content'] for c in groups[n['id']] if c.get('content') and c.get('enabled') is not False]} for n in boards]
 p['sharedStates']=['iSDAE','VI3Sz'] if p['refactor'] else []
 p['tokens']=[x for x in snapshot['variables']['variables'] if x.startswith('rf-')] if p['refactor'] else []
 p['readStatus']='read-resolved-variables-and-instances'
 p['implementationStatus']='implemented' if p['refactor'] else 'preserved'
 p['verificationStatus']='pending-citrus-runtime-record'
mapping={'revision':'2026-11-17-citrus','sourceFile':'design/设计图文件.pen','readbackFile':str((OUT/'pen-readback.json').relative_to(ROOT)).replace('\\','/'),'sha256':hashlib.sha256(raw).hexdigest(),'digestKind':'SHA256 of actual structured MCP readback','rootCount':len(roots),'resolvedNodeCount':len(nodes),'layoutProblems':[n for n in nodes if n.get('problem')],'components':{'webDialog':'rhqa8','miniDialog':'GiOGX','componentBoard':'VI3Sz'},'readMethod':'Saved through Pen File > Save, then pencil.execute Get / GetVariables with resolveVariables and resolveInstances','pages':inventory['pages']}
for name,value in [('inventory.json',inventory),('design-map.json',mapping)]: (OUT/name).write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
shutil.copyfile(old/'home-baseline.json',OUT/'home-baseline.json')
print(f'Mapped {len(inventory["pages"])} routes; {len(nodes)} nodes; {mapping["sha256"]}')
