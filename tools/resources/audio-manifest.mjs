import {createHash} from 'node:crypto';
import {lstat,readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
async function source(root,relative,optional=false){
  let file=resolve(root);
  for(const part of [null,...relative.split('/')]){
    if(part!==null)file=join(file,part);
    try{if((await lstat(file)).isSymbolicLink())throw new Error('Audio sources cannot contain symbolic links');}
    catch(error){if(error.code!=='ENOENT')throw error;}
  }
  try{return await readFile(file);}catch(error){if(optional&&error.code==='ENOENT')return null;throw error;}
}
/** The same validated release bytes feed Godot and the independent workbench. */
export async function readAudioManifest(root){
  const location='resources/audio/export/manifest.json',bytes=await source(root,location,true);
  if(!bytes)return {manifest:null,files:new Map()};
  if(bytes.length>2_000_000)throw new Error('Audio manifest exceeds repository file budget');
  const manifest=JSON.parse(bytes.toString('utf8'));
  if(!record(manifest)||manifest.format!=='astra.audio/1'||manifest.sampleFormat!=='pcm16'||manifest.sampleRate!==44100||
    !Array.isArray(manifest.cues)||manifest.cues.length<1||manifest.cues.length>128)throw new Error('Invalid audio manifest');
  if(manifest.source_sha256!==hash(await source(root,'resources/audio/synth.ts')))throw new Error('Audio export is stale: rebuild from synth.ts');
  const ids=new Set(),files=new Map([[location,bytes]]);
  for(const cue of manifest.cues){
    if(!record(cue)||typeof cue.id!=='string'||!/^[a-z][a-z0-9_]*$/.test(cue.id)||ids.has(cue.id)||cue.file!==cue.id+'.wav'||
      !['music','effect'].includes(cue.kind)||cue.sampleRate!==44100||!Number.isSafeInteger(cue.frames)||cue.frames<1||
      cue.bytes!==44+cue.frames*2||cue.bytes>2_000_000||!/^[0-9a-f]{64}$/.test(cue.sha256))throw new Error('Invalid audio cue entry');
    ids.add(cue.id);
    const file='resources/audio/export/'+cue.file,data=await source(root,file);
    if(data.length!==cue.bytes||hash(data)!==cue.sha256||data.toString('ascii',0,4)!=='RIFF'||data.readUInt32LE(4)!==data.length-8||
      data.toString('ascii',8,16)!=='WAVEfmt '||data.readUInt32LE(16)!==16||data.readUInt16LE(20)!==1||data.readUInt16LE(22)!==1||
      data.readUInt32LE(24)!==44100||data.readUInt32LE(28)!==88200||data.readUInt16LE(32)!==2||data.readUInt16LE(34)!==16||
      data.toString('ascii',36,40)!=='data'||data.readUInt32LE(40)!==cue.frames*2)throw new Error('Audio WAV differs from canonical PCM16 manifest: '+cue.id);
    files.set(file,data);
  }
  return {manifest,files};
}
