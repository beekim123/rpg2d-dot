import {createServer} from 'node:http';
import {createReadStream,statSync} from 'node:fs';
import {resolve,extname,sep} from 'node:path';
import {repoRoot} from '../lib/paths.mjs';
const root=resolve(repoRoot,'build/godot-web'),port=Number(process.env.ASTRA_GODOT_PORT??8060);
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.wasm':'application/wasm','.pck':'application/octet-stream','.png':'image/png','.svg':'image/svg+xml'};
createServer((req,res)=>{
  try {
    const url=new URL(req.url,'http://localhost'),name=decodeURIComponent(url.pathname),file=resolve(root,`.${name.endsWith('/')?name+'index.html':name}`);
    if(!file.startsWith(root+sep)||!statSync(file).isFile()){res.writeHead(404);res.end();return;}
    res.writeHead(200,{'Content-Type':types[extname(file)]??'application/octet-stream','Cache-Control':'no-store'});createReadStream(file).pipe(res);
  }catch{res.writeHead(404);res.end();}
}).listen(port,'127.0.0.1',()=>console.log(`Godot preview: http://127.0.0.1:${port}/`));
