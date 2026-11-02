#!/usr/bin/env python3
"""Destructive fixture checks, only for a fresh isolated dev JAR on loopback."""
import base64, copy, json, os, struct, zlib, urllib.request, urllib.error
BASE=os.environ.get('BASE_URL','http://127.0.0.1:8081/api/v1').rstrip('/')
if not BASE.startswith(('http://127.0.0.1:','http://localhost:')): raise SystemExit('Loopback isolated fixture only')
count=0

def req(method,path,data=None,token=None):
    headers={'Content-Type':'application/json'}
    if token: headers['Authorization']='Bearer '+token
    r=urllib.request.Request(BASE+path,data=json.dumps(data).encode() if data is not None else None,headers=headers,method=method)
    try:
        with urllib.request.urlopen(r,timeout=20) as out:
            body=out.read();return out.status,json.loads(body) if body else None
    except urllib.error.HTTPError as e:
        return e.code,json.loads(e.read())

def check(name,ok):
    global count
    assert ok,name
    count+=1;print('PASS',name,flush=True)

_,auth=req('POST','/auth/dev-login',{'role':'ADMIN'});admin=auth['token']
_,legal=req('GET','/legal/current')
_,auth=req('POST','/auth/dev-login',{'role':'USER','privacyVersion':legal['privacy']['version'],'termsVersion':legal['terms']['version']});user=auth['token']
s,initial=req('GET','/home/shortcuts');check('fresh V14 defaults four slots and honest QR',s==200 and len(initial['items'])==4 and initial['items'][2]['name']=='二维码' and initial['items'][2]['popupImageUrl']=='' and initial['items'][3]['articleId']=='OFFICIAL')
check('anonymous cannot read admin config',req('GET','/admin/home/shortcuts')[0]==401)
check('USER cannot write config',req('PUT','/admin/home/shortcuts',initial,user)[0]==403)
check('anonymous cannot write config',req('PUT','/admin/home/shortcuts',initial)[0]==401)
check('non-GET public endpoint not writable',req('PUT','/home/shortcuts',initial)[0] in (401,403,405))
# Synthetic non-QR PNG: upload test only, never a real user-facing QR asset.
def chunk(kind, data):
    return struct.pack('!I',len(data))+kind+data+struct.pack('!I',zlib.crc32(kind+data)&0xffffffff)
png=base64.b64encode(b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('!IIBBBBB',1,1,8,6,0,0,0))+chunk(b'IDAT',zlib.compress(b'\x00\xff\xff\xff\xff'))+chunk(b'IEND',b'')).decode()
s,upload=req('POST','/admin/media',{'dataBase64':png},admin);check('existing upload accepts actual PNG bytes',s==201 and upload['url'].startswith('/assets/'))
cfg=copy.deepcopy(initial);cfg['items'][2]['popupImageUrl']=upload['url'];cfg['items'][2]['popupText']='隔离测试图（非二维码）'
s,saved=req('PUT','/admin/home/shortcuts',cfg,admin);check('save versioned popup',s==200 and saved['version']==initial['version']+1)
check('stale save rejected409',req('PUT','/admin/home/shortcuts',cfg,admin)[0]==409)
_,public=req('GET','/home/shortcuts');check('public image matches saved uploaded resource',public['items'][2]['popupImageUrl']==upload['url'])
with urllib.request.urlopen(BASE.removesuffix('/api/v1')+upload['url']) as r: check('uploaded artifact image served with image type',r.status==200 and r.headers.get_content_type()=='image/png')
for label,mutate in [('arbitrary page',lambda a:a[0].update(page='/pages/admin/index')),('unsafe image',lambda a:a[2].update(popupImageUrl='javascript:alert(1)')),('duplicate slot',lambda a:a[1].update(slot=1))]:
    bad=copy.deepcopy(saved);mutate(bad['items']);check('reject '+label,req('PUT','/admin/home/shortcuts',bad,admin)[0]==400)
s,a=req('POST','/admin/articles',{'title':'隔离入口文章','summary':'private','coverUrl':upload['url']},admin);assert s==200
candidate=copy.deepcopy(saved);candidate['items'][0].update(type='ARTICLE',articleId=a['id'],page='')
check('draft target rejected',req('PUT','/admin/home/shortcuts',candidate,admin)[0]==400)
_,doc=req('PUT','/admin/articles/'+a['id']+'/content',{'version':a['version'],'blocks':[{'type':'text','text':'隔离验收正文'}]},admin)
_,a=req('POST','/admin/articles/'+a['id']+'/publish',{'version':doc['version']},admin)
s,saved=req('PUT','/admin/home/shortcuts',candidate,admin);check('published target accepted',s==200)
_,a=req('POST','/admin/articles/'+a['id']+'/official',{'version':a['version']},admin)
_,official=req('GET','/articles/official');check('dynamic official resolves current article',official['id']==a['id'])
_,a=req('POST','/admin/articles/'+a['id']+'/unpublish',{'version':a['version']},admin)
_,public=req('GET','/home/shortcuts');check('unpublish clears public specific reference and retains dynamic pointer',public['items'][0]['articleId']=='' and public['items'][3]['articleId']=='OFFICIAL')
check('unpublished article not readable',req('GET','/articles/'+a['id'])[0]==404)
check('unconfigured official explicit404',req('GET','/articles/official')[0]==404)
_,home=req('GET','/home');check('business categories unchanged',[x['code'] for x in home['categories']]==['WEEKLY','DOMESTIC','HOLIDAY','LEISURE'])
print(json.dumps({'passed':count,'isolated':True,'artifact':'executable JAR'}))
