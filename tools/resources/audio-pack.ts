import {createHash,randomUUID} from 'node:crypto';
import {mkdir,readFile,writeFile,rename,lstat,unlink} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
import {cues,cueKinds,renderCue} from '../../resources/audio/synth.ts';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const SAMPLE_RATE=44100,MAX_BYTES=2_000_000;
const sha=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
export function encodeWav(samples:Float32Array,sampleRate=44100):Buffer{
  if(!Number.isInteger(sampleRate)||sampleRate<8000||sampleRate>96000)throw new RangeError('Invalid WAV sample rate');
  if(!(samples instanceof Float32Array)||samples.length<1||44+samples.length*2>MAX_BYTES)throw new RangeError('Invalid or oversized WAV samples');
  const bytes=Buffer.alloc(44+samples.length*2);
  bytes.write('RIFF',0);bytes.writeUInt32LE(bytes.length-8,4);bytes.write('WAVEfmt ',8);
  bytes.writeUInt32LE(16,16);bytes.writeUInt16LE(1,20);bytes.writeUInt16LE(1,22);bytes.writeUInt32LE(sampleRate,24);
  bytes.writeUInt32LE(sampleRate*2,28);bytes.writeUInt16LE(2,32);bytes.writeUInt16LE(16,34);bytes.write('data',36);bytes.writeUInt32LE(samples.length*2,40);
  for(let i=0;i<samples.length;i++){
    const value=samples[i]!;if(!Number.isFinite(value)||Math.abs(value)>1)throw new RangeError('Nonfinite or clipped audio sample');
    bytes.writeInt16LE(Math.round(value*(value<0?32768:32767)),44+i*2);
  }
  return bytes;
}
function metrics(bytes:Buffer,music:boolean){
  const count=(bytes.length-44)/2;const sample=(i:number)=>bytes.readInt16LE(44+i*2)/32768;
  let first=0,last=count-1,peak=0,sum=0;
  if(!music){while(first<last&&Math.abs(sample(first))<0.0001)first++;while(last>first&&Math.abs(sample(last))<0.0001)last--;}
  for(let i=0;i<count;i++){const value=sample(i);peak=Math.max(peak,Math.abs(value));if(i>=first&&i<=last)sum+=value*value;}
  const rmsDb=20*Math.log10(Math.sqrt(sum/(last-first+1))),peakDb=20*Math.log10(peak);
  const seam=Math.abs(sample(0)-sample(count-1)),slope=Math.abs((sample(1)-sample(0))-(sample(count-1)-sample(count-2)));
  if(peakDb>-1||Math.abs(rmsDb-(music?-20:-18))>(music?2:3)||seam>=0.001||slope>=0.001)throw new Error('PCM16 cue failed peak/RMS/loop boundary checks');
  return {peakDb:Number(peakDb.toFixed(4)),rmsDb:Number(rmsDb.toFixed(4)),seam,slope};
}
async function optional(file:string):Promise<Buffer|null>{try{return await readFile(file);}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return null;throw error;}}
async function rejectSymlink(file:string):Promise<void>{try{if((await lstat(file)).isSymbolicLink())throw new Error('Refusing audio output symlink');}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}}
async function atomic(file:string,bytes:Buffer){const temporary=file+'.'+randomUUID()+'.tmp';try{await writeFile(temporary,bytes,{flag:'wx'});await rename(temporary,file);}finally{await unlink(temporary).catch(error=>{if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;});}}
export async function buildAudioPack({outDir=join(root,'resources/audio/export'),verify=false}:{outDir?:string;verify?:boolean}={}):Promise<{cues:number;mismatches:string[]}>{
  const output=resolve(outDir);
  for(let cursor=output;cursor!==root&&cursor!==resolve(tmpdir());cursor=dirname(cursor)){
    await rejectSymlink(cursor);if(cursor===dirname(cursor))break;
  }
  const prepared=cues.map(id=>{
    const bytes=encodeWav(renderCue(id,SAMPLE_RATE),SAMPLE_RATE);
    return {file:id+'.wav',bytes,entry:{id,file:id+'.wav',kind:cueKinds[id],sampleRate:SAMPLE_RATE,frames:(bytes.length-44)/2,bytes:bytes.length,sha256:sha(bytes),...metrics(bytes,cueKinds[id]==='music')}};
  });
  const source=await readFile(join(root,'resources/audio/synth.ts'));
  const manifest={format:'astra.audio/1',sampleFormat:'pcm16',sampleRate:SAMPLE_RATE,source_sha256:sha(source),cues:prepared.map(item=>item.entry)};
  const files=[...prepared.map(item=>({file:item.file,bytes:item.bytes})),{file:'manifest.json',bytes:Buffer.from(JSON.stringify(manifest,null,2)+'\n')}];
  for(const item of files)await rejectSymlink(join(output,item.file));
  const mismatches:string[]=[];
  if(!verify)await mkdir(output,{recursive:true});
  for(const item of files){const file=join(output,item.file),actual=await optional(file);if(actual?.equals(item.bytes))continue;if(verify)mismatches.push(item.file);else await atomic(file,item.bytes);}
  return {cues:cues.length,mismatches};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const verify=process.argv[2]==='--verify';if(process.argv.length>2&&!verify)throw new Error('Use no arguments to build or --verify for read-only comparison');
  const result=await buildAudioPack({verify});console.log(`Audio pack: ${result.cues} PCM16 cues, ${result.mismatches.length} mismatches`);
  if(result.mismatches.length){console.error(result.mismatches.join('\n'));process.exitCode=1;}
}
