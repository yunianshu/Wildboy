import { request, mediaUrl } from './api';
export type ContentBlock={type:'text'|'image'|'table';text?:string;url?:string;caption?:string;rows?:string[][]};
export type ContentDocument={blocks:ContentBlock[];version:number};
export async function loadContent(path:string):Promise<ContentDocument>{
 const data=await request<ContentDocument>(path);
 if(!data||!Array.isArray(data.blocks))throw new Error('图文加载失败');
 return {...data,blocks:data.blocks.map(b=>b.type==='image'?{...b,url:mediaUrl(b.url||'')}:b)};
}
