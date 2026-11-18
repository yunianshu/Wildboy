"""Generate both scoped themes from the saved A readback plus explicit implementation extensions.
The source snapshot is historical Pen data, not a claim of an updated live Pen document.
"""
from pathlib import Path
import json
ROOT = Path(__file__).resolve().parents[1]
source = ROOT / 'design/proposals/huashu-v3/design-readback-A.json'
variables = json.loads(source.read_text(encoding='utf-8'))['variables']
TOKEN_MAP = {
'rf-bg':'background','rf-surface':'surface','rf-primary':'primary','rf-ink':'ink',
'rf-muted':'muted','rf-line':'line','rf-soft':'soft','rf-danger':'cancelled',
'rf-success':'published','rf-success-bg':'published-bg','rf-warning':'draft',
'rf-warning-bg':'draft-bg','rf-danger-bg':'cancelled-bg','rf-font':'font',
'rf-radius':'radius','rf-control-radius':'radius','rf-field-line':'field',
'rf-web-control-height':'control-height','rf-sidebar':'surface','rf-sidebar-active':'soft'
}
# A's original two boards do not define these all-platform tokens. These are
# implementation extensions, explicitly separate from the historical Pen readback.
EXTENSIONS = {
'rf-info':'#466454','rf-info-bg':'#EFF5F0','rf-neutral':'#5D7064',
'rf-neutral-bg':'#F0F3EF','rf-accent':'#A9C8AA','rf-gap':'16px',
'rf-on-primary':'#FFFFFF','rf-primary-text':'#1D6543','rf-primary-hover':'#1D6543',
'rf-overlay':'#20372C66','rf-modal-radius':'12px','rf-mini-control-height':'48px',
'rf-modal-padding':'24px','rf-dialog-gap':'16px'
}
values = {}
for name, source_name in TOKEN_MAP.items():
    item = variables['hd-a-' + source_name]
    value = item['value']
    values[name] = str(value)+'px' if item['type']=='number' else json.dumps(value) if item['type']=='string' else value
values.update(EXTENSIONS)
for output, selector in [('admin/src/styles/tokens.css', ':root'),('miniprogram/src/styles/slate-tokens.wxss','page')]:
    lines = ['/* A dawn-green theme: saved design-readback-A.json + explicit extensions.', ' * Regenerate with scripts/ui-refresh-tokens.py. Historical rf-* names retained. */',selector+' {']
    lines.extend(f'  --{key}: {value};' for key,value in values.items())
    (ROOT/output).write_text('\n'.join(lines+['}','']),encoding='utf-8')
    print(f'Generated {output} ({len(values)} tokens)')
