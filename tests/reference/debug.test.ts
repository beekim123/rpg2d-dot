import {expect,it} from 'vitest';
import {debugStart} from '../../reference/web/src/debug/params.ts';
import {maps} from '../../reference/web/src/content.ts';
it('debug URLs fall back safely for blocked and invalid coordinates',()=>{
  expect(debugStart('?map=missing',maps)).toBeUndefined();
  expect(debugStart('?map=lantern.test&at=10,11',maps)?.player.x).toBe(8);
  expect(debugStart('?map=lantern.test&at=15,12',maps)?.player.x).toBe(15);
  expect(debugStart('?map=lantern.test&at=Infinity,2',maps)?.player.x).toBe(8);
});
it('rejects Object prototype names as map IDs',()=>{
  for(const id of ['constructor','__proto__','toString'])expect(debugStart(`?map=${id}`,maps)).toBeUndefined();
});
