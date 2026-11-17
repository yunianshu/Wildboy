"""Generate scoped theme tokens from the actual saved, resolved Pen readback.

Source: docs/ui-refactor/berry/pen-readback.json (B 莓果晴天, hd-b-* variables).
Output keeps the historical --rf-* token NAMES used across both platforms
(admin + non-home miniprogram pages); values are the Berry palette.
"""
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]
source = ROOT / 'docs/ui-refactor/berry/pen-readback.json'
variables = json.loads(source.read_text(encoding='utf-8'))['variables']

# 生产令牌名（历史命名） ← Pen hd-b-* 变量
TOKEN_MAP = {
    'rf-bg': 'hd-b-bg',
    'rf-surface': 'hd-b-surface',
    'rf-primary': 'hd-b-primary',
    'rf-ink': 'hd-b-ink',
    'rf-muted': 'hd-b-muted',
    'rf-line': 'hd-b-line',
    'rf-soft': 'hd-b-soft',
    'rf-danger': 'hd-b-danger',
    'rf-success': 'hd-b-success',
    'rf-success-bg': 'hd-b-success-bg',
    'rf-warning': 'hd-b-warning',
    'rf-warning-bg': 'hd-b-warning-bg',
    'rf-danger-bg': 'hd-b-danger-bg',
    'rf-info': 'hd-b-info',
    'rf-info-bg': 'hd-b-info-bg',
    'rf-neutral': 'hd-b-neutral',
    'rf-neutral-bg': 'hd-b-neutral-bg',
    'rf-sidebar': 'hd-b-nav',
    'rf-sidebar-active': 'hd-b-nav-active',
    'rf-accent': 'hd-b-accent',
    'rf-font': 'hd-b-font',
    'rf-gap': 'hd-b-gap',
    'rf-radius': 'hd-b-radius-block',
    'rf-control-radius': 'hd-b-radius',
    'rf-on-primary': 'hd-b-on-primary',
    'rf-primary-text': 'hd-b-primary-text',
    'rf-primary-hover': 'hd-b-primary-hover',
    'rf-field-line': 'hd-b-field',
    'rf-overlay': 'hd-b-overlay',
    'rf-modal-radius': 'hd-b-modal-radius',
    'rf-web-control-height': 'hd-b-web-control-height',
    'rf-mini-control-height': 'hd-b-mini-control-height',
    'rf-modal-padding': 'hd-b-modal-padding',
    'rf-dialog-gap': 'hd-b-dialog-gap',
}

lines = [
    '/* Source: Pen hd-b-* variables (B 莓果晴天, docs/ui-refactor/berry/pen-readback.json);',
    ' * regenerate with scripts/ui-refresh-tokens.py. Token names keep historical rf-* prefix. */',
]
rules = []
missing = []
for out_name, pen_name in TOKEN_MAP.items():
    if pen_name not in variables:
        missing.append(pen_name)
        continue
    value = variables[pen_name]
    resolved = value['value']
    if value['type'] == 'number':
        resolved = str(resolved) + 'px'
    elif value['type'] == 'string':
        resolved = '"' + resolved + '"'
    rules.append(f'  --{out_name}: {resolved};')
if missing:
    raise SystemExit(f'Pen 变量缺失: {missing}')
for output, selector in [
    ('admin/src/styles/tokens.css', ':root'),
    ('miniprogram/src/styles/slate-tokens.wxss', 'page'),
]:
    path = ROOT / output
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text('\n'.join(lines + [selector + ' {'] + rules + ['}', '']), encoding='utf-8')
    print(f'Generated {output} ({len(rules)} tokens)')
