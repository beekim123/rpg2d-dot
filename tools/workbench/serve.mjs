import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {repoRoot} from '../lib/paths.mjs';
const html=join(repoRoot,'build/asset-workbench/index.html');
const port=Number(process.env.ASTRA_WORKBENCH_PORT??8787);
createServer((request,response)=>{
  const path=new URL(request.url,'http://localhost').pathname;
  if(!['/','/index.html'].includes(path)){response.writeHead(404);response.end();return;}
  try {response.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});response.end(readFileSync(html));}
  catch {response.writeHead(503);response.end('Build the workbench first: npm run workbench:build');}
}).listen(port,'127.0.0.1',()=>console.log(`Asset workbench: http://127.0.0.1:${port}/`));
