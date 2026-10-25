import {readFileSync,readdirSync,statSync} from 'node:fs';
import {join} from 'node:path';
import {repoRoot} from '../lib/paths.mjs';
import {validateContent} from '../../reference/web/src/systems/content-check.ts';
import {maps,scripts,words} from '../../reference/web/src/content.ts';
import {battles} from '../../reference/web/src/battle/content.ts';
import {validateBattles} from '../../reference/web/src/battle/content-check.ts';
import {validateBattlePresentation} from '../../reference/web/src/scenes/battle-catalog.ts';
const manifest=JSON.parse(readFileSync(join(repoRoot,'resources/art/export/manifest.json'),'utf8')) as {assets:{id:string}[]};
const errors=[...validateContent(maps,scripts,words,new Set(manifest.assets.map(a=>a.id))),...validateBattles(battles),...validateBattlePresentation(battles,maps,new Set(manifest.assets.map(a=>a.id)),words)];
function scan(dir:string):void {for(const item of readdirSync(dir,{withFileTypes:true})){const path=join(dir,item.name);if(item.isDirectory())scan(path);else if(statSync(path).size>2*1024*1024)errors.push(`oversized file ${path}`);}}
for(const directory of ['reference/web','content','resources','third_party','godot/scenes','godot/scripts','godot/resources','godot/data','godot/tests','tools','config','docs','artifacts','tests'])scan(join(repoRoot,directory));
if(errors.length){console.error(errors.join('\n'));process.exitCode=1;}else console.log(`Content OK: ${Object.keys(battles).length} battle candidates, ${Object.keys(maps).length} map, ${Object.keys(scripts).length} script, ${manifest.assets.length} sprites, ${Object.keys(words).length} strings; objectives reachable.`);
