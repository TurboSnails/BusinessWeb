import {request} from 'node:https'
import type {Http} from '../../knowledge-sync/transport'
export function nativeHttp(parent:AbortSignal):Http {
 return (url,init)=>new Promise((resolve,reject)=>{
  const req=request(url,{method:init.method,headers:init.headers,signal:AbortSignal.any([parent,init.signal])},res=>{
   const status=res.statusCode??0
   if(status>=300&&status<400){res.resume();reject(new Error('服务器重定向已拒绝'));return}
   const chunks:Buffer[]=[];let bytes=0
   res.on('data',chunk=>{bytes+=chunk.length;if(bytes>3_000_000){req.destroy(new Error('服务器响应过大'));return}chunks.push(chunk)})
   res.on('error',reject);res.on('end',()=>{try{resolve({status,body:JSON.parse(Buffer.concat(chunks).toString('utf8'))})}catch{reject(new Error('服务器响应格式无效'))}})
  })
  req.on('error',()=>reject(new Error(parent.aborted?'同步已停止':'服务器连接失败，请检查网络')))
  if(init.body)req.write(init.body);req.end()
 })
}
