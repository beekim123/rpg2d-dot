import {afterEach,expect,it} from 'vitest';
import {mkdtemp,readFile,writeFile,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {encodeWav,buildAudioPack} from '../../tools/resources/audio-pack.ts';
const folders:string[]=[];
afterEach(async()=>{for(const folder of folders.splice(0))await rm(folder,{recursive:true,force:true});});
it('encodes explicit mono PCM16 samples and a standard RIFF header',()=>{
  const bytes=encodeWav(new Float32Array([-1,0,0.5,1]),44100);
  expect(bytes.subarray(0,4).toString()).toBe('RIFF');expect(bytes.subarray(8,12).toString()).toBe('WAVE');
  expect(bytes.readUInt32LE(4)).toBe(44);expect(bytes.readUInt16LE(20)).toBe(1);expect(bytes.readUInt16LE(22)).toBe(1);
  expect(bytes.readUInt32LE(24)).toBe(44100);expect(bytes.readUInt16LE(34)).toBe(16);expect(bytes.readUInt32LE(40)).toBe(8);
  expect([0,1,2,3].map(i=>bytes.readInt16LE(44+i*2))).toEqual([-32768,0,16384,32767]);
});
it('rejects bad sample rates, nonfinite samples and clipping instead of hiding errors',()=>{
  for(const rate of [0,7999,44100.5,NaN,Infinity])expect(()=>encodeWav(new Float32Array([0]),rate)).toThrow();
  for(const value of [NaN,Infinity,-Infinity,1.01,-1.01])expect(()=>encodeWav(new Float32Array([value]),44100)).toThrow();
});
it('refuses symbolic output ancestors before writing outside the chosen output tree',async()=>{
  const folder=await mkdtemp(join(tmpdir(),'astra-audio-link-'));folders.push(folder);
  await symlink(folder,join(folder,'link'),'dir');
  await expect(buildAudioPack({outDir:join(folder,'link','export')})).rejects.toThrow(/symlink/i);
});
it('builds deterministic first-party cues under2MB and verifies without repairing edits',async()=>{
  const outDir=await mkdtemp(join(tmpdir(),'astra-audio-pack-'));folders.push(outDir);
  const built=await buildAudioPack({outDir});expect(built.cues).toBe(14);
  const first=await readFile(join(outDir,'manifest.json'));
  const manifest=JSON.parse(first.toString());expect(manifest.cues.every((c:{bytes:number})=>c.bytes<2000000)).toBe(true);
  expect(manifest.cues.find((c:{id:string})=>c.id==='battle_theme')).toMatchObject({kind:'music',frames:705600,sampleRate:44100});
  await buildAudioPack({outDir});expect(await readFile(join(outDir,'manifest.json'))).toEqual(first);
  expect((await buildAudioPack({outDir,verify:true})).mismatches).toEqual([]);
  await writeFile(join(outDir,'confirm.wav'),'tampered');
  expect((await buildAudioPack({outDir,verify:true})).mismatches).toContain('confirm.wav');
  expect(await readFile(join(outDir,'confirm.wav'),'utf8')).toBe('tampered');
});
