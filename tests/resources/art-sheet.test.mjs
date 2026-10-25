import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {sheet,renderAll} from '../../tools/resources/art.mjs';
import {decodePNG} from '../../resources/art/lib/png.mjs';

test('overview pagination keeps every asset visible within the canvas and repository budgets',async()=>{
  const outDir=await mkdtemp(path.join(os.tmpdir(),'astra-sheet-'));
  try {
    await sheet({outDir});const metadata=JSON.parse(await readFile(path.join(outDir,'sheets/m0.json'),'utf8'));
    assert.ok(metadata.pages.length>1,'The expanded library needs multiple audit pages');
    const found=[];
    for(const page of metadata.pages){const bytes=await readFile(path.join(outDir,'sheets',page.image));const image=decodePNG(bytes);
      assert.ok(image.width*image.height<=4194304);assert.ok(bytes.length<2000000);
      for(const item of page.labels){found.push(item.id);assert.ok(item.cell[1]+item.cell[3]<=image.height/metadata.scale);}
    }
    const {rendered}=await renderAll();assert.deepEqual(found.sort(),rendered.map(a=>a.meta.id).sort());assert.equal(new Set(found).size,found.length);
  }finally{await rm(outDir,{recursive:true,force:true});}
});
