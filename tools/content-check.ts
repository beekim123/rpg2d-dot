import {readFileSync,readdirSync,statSync} from 'node:fs';
import {join} from 'node:path';
import {validateContent} from '../src/systems/content-check.ts';
import {maps,scripts,words} from '../src/content.ts';
const manifest=JSON.parse(readFileSync('art/export/manifest.json','utf8')) as {assets:{id:string}[]};
const errors=validateContent(maps,scripts,words,new Set(manifest.assets.map(a=>a.id)));
function scan(dir:string):void {for(const item of readdirSync(dir,{withFileTypes:true})){const path=join(dir,item.name);if(item.isDirectory())scan(path);else if(statSync(path).size>2*1024*1024)errors.push(`oversized file ${path}`);}}
for(const directory of ['src','content','art','audio','third_party'])scan(directory);
if(errors.length){console.error(errors.join('\n'));process.exitCode=1;}else console.log(`Content OK: ${Object.keys(maps).length} map, ${Object.keys(scripts).length} script, ${manifest.assets.length} sprites, ${Object.keys(words).length} strings; objectives reachable.`);
