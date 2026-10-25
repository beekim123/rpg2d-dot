import yard from '../../../content/maps/lantern-yard.json' with {type:'json'};
import map from '../../../content/maps/lantern-test.json' with {type:'json'};
import story from '../../../content/story/m0.json' with {type:'json'};
import language from '../../../content/i18n/zh-Hans/ui.json' with {type:'json'};
import { parseMap, type MapData } from './systems/world.ts';
import type { Command } from './systems/story.ts';
export const maps:Record<string,MapData> = { [map.id]: parseMap(map), [yard.id]:parseMap(yard) };
export const scripts:Record<string,Command[]> = story as Record<string,Command[]>;
export const words:Record<string,string> = language;
export function t(key:string):string { const text=words[key];if(text===undefined)throw new Error(`Missing text ${key}`);return text; }
