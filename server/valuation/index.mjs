import {createValuationServer} from './http.mjs'
const port=Number(process.env.VALUATION_PORT||8788)
if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('VALUATION_PORT无效')
const server=createValuationServer();server.listen(port,'127.0.0.1',()=>console.log(`公司估值服务：http://127.0.0.1:${port}，请同时运行 npm run dev`))
for(const sig of ['SIGINT','SIGTERM'])process.on(sig,()=>server.close(()=>process.exit(0)))
