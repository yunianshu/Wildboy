from pathlib import Path
import hashlib
import json

ROOT=Path(__file__).resolve().parent
DESIGN=ROOT.parents[1]/'设计图文件.pen'
directions=[
    ('A','晨光绿白',['n2cQ6B','O79Ql'],['AYzxR','gHFFL','uimmZ','ZJcSD','LxzCX','SK9Fl','n5dATU','lBpug','GCIUe'],'dir-1.html'),
    ('B','莓果晴天',['H3X2a','HyvJK'],['iLJFv','G36zmt','CG8d0','fsh8n','I8Qyzu','M0fAx','LhnkF'],'dir-2.html'),
    ('C','杏黄留白',['M894N','Nu5Gj'],['SSYgy','R7IaYI','oiKfb','gejtk','yN8KC','REFyz','OKILy','asRCP','lemCo','o0TzXY','q3sOy'],'dir-3.html'),
]
mapping=[]
for key,name,roots,components,html in directions:
    source=ROOT/f'design-readback-{key}.json'
    data=json.loads(source.read_text(encoding='utf-8'))
    assert data['roots']==roots
    entry={
        'platform':'web','route':'/activities','direction':key,'name':name,
        'designFile':str(DESIGN),'artboards':roots,'components':components,
        'variables':data['variables'],
        'readbackFile':source.name,'readbackSha256':hashlib.sha256(source.read_bytes()).hexdigest(),
        'readAfterSave':'2026-11-17T15:00:52.130676+08:00',
        'previewFile':f'design-demos/{html}',
        'implementationTarget':['admin/src/views/ActivitiesView.vue','admin/src/App.vue','admin/src/components/ConfirmDialog.vue'],
        'productionImplemented':False,
        'dataSource':{'production':'GET /admin/activities?page&size=8&category&status&title','preview':'sample-data.json (design-only)'},
        'interactions':['title search','category/status filter','reset and empty result','navigation group/drawer preview','paid orders versus free roster','editor publish confirmation preview'],
        'responsiveNote':'1440x900 Pen layout; smaller widths follow each HTML preview and its verification notes. Mobile HTML is not a mini-program runtime.',
    }
    preview=ROOT/'design-demos'/html
    if preview.exists(): entry['previewSha256']=hashlib.sha256(preview.read_bytes()).hexdigest()
    mapping.append(entry)
result={'version':1,'status':'proposals-awaiting-user-selection','selectedDirection':None,
        'penSave':{'modifiedAt':'2026-11-17T15:00:52.130676+08:00','size':5064358,'verification':'saved-root-evidence.json'},
        'scope':'Three alternatives for one admin homepage and matching components/dialogs',
        'thumbnailArtboard':'m1HOo','pages':mapping,
        'protectedMiniHome':{'route':'pages/home/index','status':'preserved; source verification only in this proposal stage','evidence':'home-protection.json'}}
(ROOT/'design-map.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
print('Mapped three saved and re-read Pen designs to previews; no production implementation claimed.')
