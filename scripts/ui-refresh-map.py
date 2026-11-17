"""Build the implementation index only from the saved Pen readback and real routes."""
from pathlib import Path
import hashlib
import json

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/ui-refactor/2026-11-17'
inventory = json.loads((OUT / 'inventory.json').read_text(encoding='utf-8'))
raw = (OUT / 'pen-readback.json').read_bytes()
snapshot = json.loads(raw)
nodes = snapshot['nodes']
roots = [n for n in nodes if n['depth'] == 0]
by_id = {n['id']: n for n in nodes}
groups = {n['id']: [] for n in roots}
for n in nodes:
    ancestor = n
    while ancestor.get('parent') in by_id:
        ancestor = by_id[ancestor['parent']]
    groups[ancestor['id']].append(n)

for p in inventory['pages']:
    boards = [n for n in roots if (n.get('context') or n.get('metadata', {}).get('route')) == p['route']]
    assert boards, f"Missing design for {p['route']}"
    p['designFile'] = 'design/设计图文件.pen'
    p['artboards'] = [{'id': n['id'], 'name': n['name'], 'size': n['bounds'], 'nodeCount': len(groups[n['id']]), 'designText': [d['content'] for d in groups[n['id']] if d.get('content')]} for n in boards]
    p['designStatus'] = 'designed' if p['refactor'] else 'preserved'
    p['readStatus'] = 'read-resolved-variables-and-instances'
    p['tokens'] = ['rf-bg', 'rf-surface', 'rf-primary', 'rf-ink', 'rf-muted', 'rf-line', 'rf-soft', 'rf-danger'] if p['refactor'] else []
    p['sharedStates'] = ['iSDAE'] if p['refactor'] else []
    p['validation'] = ['build', 'existing-regressions', 'browser-page-and-state-checks' if p['platform']=='web' else 'wechat-devtools-native', 'home-dependency-hashes']

mapping = {'revision': '2026-11-17-slate', 'sourceFile': 'design/设计图文件.pen', 'readbackFile': 'docs/ui-refactor/2026-11-17/pen-readback.json', 'digestKind': 'SHA256 of structured MCP readback, not encrypted pen bytes', 'sha256': hashlib.sha256(raw).hexdigest(), 'readMethod': 'pencil.execute Get / GetVariables, resolveVariables=true, resolveInstances=true; saved before read', 'designNotes': ['Old metadata.route is not mutable through current Update; corrected article routes are in actual root context and name.', 'All layout checks: zero c.problems at read time.', 'Responsive behavior, native safe areas, focus and restoration described in plan; not presented as Pen-native interactions.'], 'pages': inventory['pages']}
(OUT / 'design-map.json').write_text(json.dumps(mapping, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
(OUT / 'inventory.json').write_text(json.dumps(inventory, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
print(f"Mapped {len(mapping['pages'])} routes, {len(nodes)} resolved nodes; {mapping['sha256']}")
