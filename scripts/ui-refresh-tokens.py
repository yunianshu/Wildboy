"""Generate scoped theme tokens from the actual saved, resolved Pen readback."""
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]
source = ROOT / 'docs/ui-refactor/2026-11-17-citrus/pen-readback.json'
variables = json.loads(source.read_text(encoding='utf-8'))['variables']['variables']
lines = ['/* Source: Pen rf-* variables; regenerate with scripts/ui-refresh-tokens.py. */']
rules = []
for name, value in variables.items():
    if not name.startswith('rf-'):
        continue
    resolved = value['value']
    if value['type'] == 'number':
        resolved = str(resolved) + 'px'
    elif value['type'] == 'string':
        resolved = '"' + resolved + '"'
    rules.append(f'  --{name}: {resolved};')
for output, selector in [('admin/src/styles/tokens.css', ':root'), ('miniprogram/src/styles/slate-tokens.wxss', 'page')]:
    path = ROOT / output
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text('\n'.join(lines+[selector+' {']+rules+['}', '']), encoding='utf-8')
print('Generated Web and non-home mini tokens from saved Pen data')
