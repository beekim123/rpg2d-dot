import {defineConfig} from 'vite';
import {resolve,sep,extname} from 'node:path';
import {cpSync,existsSync,createReadStream,statSync,mkdirSync,readFileSync} from 'node:fs';
import {repoRoot} from '../tools/lib/paths.mjs';
const webRoot=resolve(repoRoot,'reference/web');
const output=resolve(repoRoot,'build/reference-web');
const artRoot=resolve(repoRoot,'resources/art/export');
export default defineConfig({
  root:webRoot,base:'./',
  server:{fs:{allow:[repoRoot]}},
  plugins:[{
    name:'astra-reference-resources',
    configureServer(server){
      server.middlewares.use((request,response,next)=>{
        if(request.url?.split('?')[0]==='/workbench/'||request.url?.split('?')[0]==='/workbench/index.html'){
          response.setHeader('Content-Type','text/html; charset=utf-8');
          response.end(readFileSync(resolve(repoRoot,'build/asset-workbench/index.html')));return;
        }
        if(!request.url?.startsWith('/art/export/'))return next();
        try{
          const name=decodeURIComponent(new URL(request.url,'http://localhost').pathname.slice('/art/export/'.length));
          const file=resolve(artRoot,name);
          if(!file.startsWith(artRoot+sep)||!statSync(file).isFile())return next();
          response.setHeader('Content-Type',extname(file)==='.png'?'image/png':'application/json');
          createReadStream(file).on('error',()=>response.destroy()).pipe(response);
        }catch{next();}
      });
    },
    closeBundle(){
      if(existsSync(artRoot))cpSync(artRoot,resolve(output,'art/export'),{recursive:true});
      mkdirSync(resolve(output,'workbench'),{recursive:true});
      cpSync(resolve(repoRoot,'build/asset-workbench/index.html'),resolve(output,'workbench/index.html'));
      cpSync(resolve(repoRoot,'third_party'),resolve(output,'third_party'),{recursive:true});
    },
  }],
  build:{outDir:output,emptyOutDir:true,rollupOptions:{input:{game:resolve(webRoot,'index.html')}}},
});
