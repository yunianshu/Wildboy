import {request,mediaUrl,sessionVersion,isSessionCurrent} from './api';
export type ContentBlock={type:'text'|'image'|'table';text?:string;url?:string;caption?:string;rows?:string[][]};
export type ContentDocument={blocks:ContentBlock[];version:number};
export async function loadContent(path:string):Promise<ContentDocument>{
 const data=await request<ContentDocument>(path);
 if(!data||!Array.isArray(data.blocks))throw new Error('图文加载失败');
 return {...data,blocks:data.blocks.map(b=>b.type==='image'?{...b,url:mediaUrl(b.url||'')}:b)};
}
export async function uploadImage():Promise<string>{
 const session=sessionVersion();
 const result=await wx.chooseMedia({count:1,mediaType:['image'],sourceType:['album','camera'],sizeType:['compressed']});
 const file=result.tempFiles[0];
 if(!file||file.size>4*1024*1024)throw new Error('请选择 4MB 内 JPG/PNG 图片');
 const data=await new Promise<string>((resolve,reject)=>wx.getFileSystemManager().readFile({filePath:file.tempFilePath,encoding:'base64',success:r=>resolve(String(r.data)),fail:reject}));
 if(!isSessionCurrent(session))throw new Error('账号已改变，请重新上传');
 const response=await request<{url:string}>('/admin/media','POST',{dataBase64:data});
 return response.url;
}
