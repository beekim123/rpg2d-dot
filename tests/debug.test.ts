import {expect,it} from 'vitest';
import {debugStart} from '../src/debug/params.ts';
import {maps} from '../src/content.ts';
it('debug URLs fall back safely for blocked and invalid coordinates',()=>{
  expect(debugStart('?map=missing',maps)).toBeUndefined();
  expect(debugStart('?map=lantern.test&at=10,11',maps)?.player.x).toBe(8);
  expect(debugStart('?map=lantern.test&at=15,12',maps)?.player.x).toBe(15);
  expect(debugStart('?map=lantern.test&at=Infinity,2',maps)?.player.x).toBe(8);
});
