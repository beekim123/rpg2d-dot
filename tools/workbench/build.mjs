import { readFile, writeFile, readdir, mkdir, lstat, rename, unlink } from 'node:fs/promises';
import { dirname, join, resolve, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import vm from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';
import { repoRoot as defaultRoot } from '../lib/paths.mjs';
import {readAudioManifest} from '../resources/audio-manifest.mjs';

const FONT_ROOT = 'third_party/fonts/fusion-pixel-12px';
const FONT_FILE = 'fusion-pixel-12px-proportional-zh_hans.otf.woff2';
const MARKERS = ['STYLE', 'DATA', 'SYNTH', 'VIEWER'];
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const order = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const dataUri = (mime, bytes) => `data:${mime};base64,${bytes.toString('base64')}`;
const jsonForScript = value => JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
// Preserve JS string/regexp values while preventing HTML raw-text parser boundaries.
const scriptText = source => source.replace(/<\/script/gi, match => match.replace('/', '\\/')).replace(/<!--/g, '\\x3c!--');

async function inputPath(root, name) {
  if (!name.split('/').every(part => /^[\w.-]+$/.test(part) && part !== '.' && part !== '..')) throw new Error(`Unsafe input path: ${name}`);
  let file = resolve(root);
  for (const part of name.split('/')) {
    file = join(file, part);
    if ((await lstat(file)).isSymbolicLink()) throw new Error(`Unsafe symbolic link input: ${name}`);
  }
  return file;
}
async function bytesAt(root, name) { return readFile(await inputPath(root, name)); }
async function textAt(root, name) {
  const bytes = await bytesAt(root, name), text = bytes.toString('utf8');
  if (!Buffer.from(text).equals(bytes)) throw new Error(`Invalid UTF-8 input: ${name}`);
  return text;
}
async function fontLicenses(root, directory = FONT_ROOT) {
  const result = [], entries = await readdir(await inputPath(root, directory), {withFileTypes: true});
  for (const entry of entries.sort((a, b) => order(a.name, b.name))) {
    if (entry.isSymbolicLink()) throw new Error(`Unsafe font license symbolic link: ${entry.name}`);
    if (entry.name.startsWith('.')) continue;
    const name = `${directory}/${entry.name}`;
    if (entry.isDirectory()) result.push(...await fontLicenses(root, name));
    else if (/\.(?:txt|md)$/i.test(entry.name)) result.push({name: name.slice(FONT_ROOT.length + 1), text: await textAt(root, name)});
  }
  return result;
}
async function verifyCopy(root, source, destination, label) {
  let copy;
  try { copy = await bytesAt(root, destination); }
  catch (error) { throw new Error(`Godot ${label} missing or inaccessible: ${destination}`, {cause: error}); }
  if (!copy.equals(source)) throw new Error(`Godot ${label} differs from canonical source: ${destination}`);
}

// Conservative dependency scan for the intentionally small, classic-script input contract.
// Quoted strings and comments are data; template expressions remain visible to the scan.
const dependencyTokens = source => source.replace(/"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|\/\*[\s\S]*?\*\/|\/\/[^\r\n]*/g, value => ' '.repeat(value.length));
function rejectDependencies(source, filename, rejectExports = true) {
  const tokens = dependencyTokens(source);
  if (/\bimport\b|\brequire\s*\(/.test(tokens) || (rejectExports && /\bexport\b/.test(tokens))) {
    throw new Error(`Runtime import/export dependencies are forbidden in ${filename}`);
  }
  if (/\b(?:fetch|importScripts|sendBeacon)\s*\(|\bnew\s+(?:XMLHttpRequest|WebSocket|EventSource|Worker|SharedWorker)\b/.test(tokens)) {
    throw new Error(`Runtime network/worker dependencies are forbidden in ${filename}`);
  }
}
function checkStandaloneScript(source, filename) {
  rejectDependencies(source, filename);
  // Compile without executing: viewer DOM work happens only when the standalone file is opened.
  new vm.Script(source, {filename});
}
function synthBundle(source, labels) {
  rejectDependencies(source, 'synth.ts', false);
  const stripped = stripTypeScriptTypes(source, {mode: 'strip'});
  // Only direct exported const/function declarations are supported. Type-only exports vanish above.
  const declarations = stripped.replace(/(^|[;\r\n])([ \t]*)export[ \t]+(?=(?:const|function)\b)/g, '$1$2');
  checkStandaloneScript(declarations, 'stripped synth.js');
  const closure = `(() => {\n"use strict";\n${declarations}\nreturn Object.freeze({renderCue, cues, cueKinds, cueDurations, cueSampleRates:typeof cueSampleRates==='undefined'?{}:cueSampleRates});\n})()`;
  // Read declarations only; renderCue is never invoked during builds. No process/require is exposed.
  const api = new vm.Script(closure, {filename: 'astra-synth.js'}).runInNewContext({}, {timeout: 1000});
  if (!Array.isArray(api.cues) || !api.cueKinds || !api.cueDurations || typeof api.renderCue !== 'function') throw new Error('Synth metadata exports missing');
  const seen = new Set();
  const cues = Array.from(api.cues, id => {
    if (typeof id !== 'string' || !/^[a-z][a-z0-9_]*$/.test(id) || seen.has(id)) throw new Error(`Unsafe or duplicate audio cue: ${id}`);
    seen.add(id);
    if (!Object.hasOwn(labels, id) || typeof labels[id] !== 'string' || labels[id].trim() === '') throw new Error(`Missing independent audio label: ${id}`);
    const kind = api.cueKinds[id], duration = api.cueDurations[id];
    if (!['music', 'effect'].includes(kind) || !Number.isFinite(duration) || duration <= 0) throw new Error(`Invalid audio cue metadata: ${id}`);
    const sampleRate=api.cueSampleRates[id]??44100;
    if(!Number.isInteger(sampleRate)||sampleRate<8000||sampleRate>96000)throw new Error(`Invalid audio sample rate: ${id}`);
    return {id, label: labels[id], kind, duration, sampleRate};
  });
  return {source: `window.ASTRA_SYNTH = ${closure};`, cues};
}
function checkTemplate(template, style) {
  for (const name of MARKERS) {
    if (template.split(`<!-- ASTRA:${name} -->`).length !== 2) throw new Error(`Template marker must appear exactly once: ${name}`);
  }
  if (template.indexOf('<!-- ASTRA:DATA -->') > template.indexOf('<!-- ASTRA:VIEWER -->') ||
    template.indexOf('<!-- ASTRA:SYNTH -->') > template.indexOf('<!-- ASTRA:VIEWER -->')) throw new Error('Template data/synth markers must precede viewer marker');
  for (const match of template.matchAll(/\b(?:src|href|poster|action)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)) {
    const value = match[1] ?? match[2] ?? match[3];
    if (!/^(?:data:|#|$)/i.test(value)) throw new Error(`External template dependency is forbidden: ${value}`);
  }
  if (/@import\b/i.test(style)) throw new Error('CSS import dependencies are forbidden');
  for (const match of style.matchAll(/url\(\s*(["']?)(.*?)\1\s*\)/gi)) {
    if (!/^(?:data:|#)/i.test(match[2])) throw new Error(`External CSS dependency is forbidden: ${match[2]}`);
  }
}
async function atomicWrite(file, bytes) {
  const temporary = `${file}.astra-${randomUUID()}.tmp`;
  let created = false;
  try {
    await writeFile(temporary, bytes, {flag: 'wx'}); created = true;
    await rename(temporary, file); created = false;
  } finally { if (created) await unlink(temporary); }
}

/** Package canonical assets into one movable HTML file; no game runtime is imported. */
export async function buildWorkbench({repoRoot = defaultRoot, outDir = join(repoRoot, 'build/asset-workbench'), verifyGodot = true} = {}) {
  if (typeof verifyGodot !== 'boolean') throw new Error('verifyGodot must be a boolean');
  const manifestJson = await textAt(repoRoot, 'resources/art/export/manifest.json');
  const manifest = JSON.parse(manifestJson);
  if (manifest.format !== 'astra.art/1' || !Array.isArray(manifest.assets)) throw new Error('Invalid art manifest');
  const pngs = Object.create(null), files = new Set();
  let frames = 0;
  for (const asset of manifest.assets) {
    if (!asset || !/^[a-z][a-z0-9_.-]*$/.test(asset.id) || !/^[\w.-]+\.png$/.test(asset.file) || Object.hasOwn(pngs, asset.id) || files.has(asset.file)) throw new Error(`Unsafe or duplicate art entry: ${asset?.id}`);
    files.add(asset.file);
    const bytes = await bytesAt(repoRoot, `resources/art/export/${asset.file}`);
    if (sha(bytes) !== asset.hash) throw new Error(`Source PNG hash mismatch: ${asset.id}`);
    if (verifyGodot) await verifyCopy(repoRoot, bytes, `godot/resources/art/${asset.file}`, `PNG ${asset.id}`);
    pngs[asset.id] = dataUri('image/png', bytes);
    if (!Number.isInteger(asset.frames) || asset.frames < 1) throw new Error(`Invalid art frame count: ${asset.id}`);
    frames += asset.frames;
  }
  if (verifyGodot) await verifyCopy(repoRoot, Buffer.from(manifestJson), 'godot/resources/art/manifest.json', 'manifest');
  const palette = JSON.parse(await textAt(repoRoot, 'resources/art/palette.json'));
  if (palette.format !== 'astra.palette/1' || !Array.isArray(palette.colors)) throw new Error('Invalid palette');
  const font = await bytesAt(repoRoot, `${FONT_ROOT}/${FONT_FILE}`), licenses = await fontLicenses(repoRoot);
  if (!licenses.some(license => /(?:OFL|LICENSE)/i.test(license.name))) throw new Error('Font licenses missing');
  if (verifyGodot) await verifyCopy(repoRoot, font, `godot/resources/fonts/fusion-pixel-12px/${FONT_FILE}`, 'font');
  const synth = await textAt(repoRoot, 'resources/audio/synth.ts');
  const labels = JSON.parse(await textAt(repoRoot, 'workbench/audio-labels.json'));
  if (labels === null || typeof labels !== 'object' || Array.isArray(labels)) throw new Error('Independent audio labels missing');
  const audio = synthBundle(synth, labels);
  const release=await readAudioManifest(repoRoot);
  if(release.manifest){
    if(release.manifest.cues.length!==audio.cues.length||audio.cues.some(cue=>!release.manifest.cues.some(entry=>entry.id===cue.id&&entry.kind===cue.kind&&entry.sampleRate===cue.sampleRate&&Math.abs(entry.frames/entry.sampleRate-cue.duration)<1/entry.sampleRate)))throw new Error('Audio release metadata differs from independent synthesizer');
    if(verifyGodot)for(const [source,bytes] of release.files)await verifyCopy(repoRoot,bytes,'godot/resources/audio/'+source.split('/').at(-1),'audio');
  }
  const template = await textAt(repoRoot, 'workbench/index.html');
  const style = await textAt(repoRoot, 'workbench/style.css');
  const viewer = await textAt(repoRoot, 'workbench/viewer.js');
  checkTemplate(template, style); checkStandaloneScript(viewer, 'viewer.js');
  const payload = {
    format: 'astra.workbench/1',
    art: {manifest, manifest_json: manifestJson, pngs}, palette,
    font: {data_url: dataUri('font/woff2', font), licenses},
    audio: {source_sha256: sha(Buffer.from(synth)), cues: audio.cues, sample_format:release.manifest?.sampleFormat??'float32'},
  };
  const replacements = {
    STYLE: `<style id="astra-workbench-style">${style.replace(/<\/style/gi, match => match.replace('/', '\\/'))}</style>`,
    DATA: `<script id="astra-workbench-data" type="application/json">${jsonForScript(payload)}</script>`,
    SYNTH: `<script>${scriptText(audio.source)}</script>`,
    VIEWER: `<script>${scriptText(viewer)}</script>`,
  };
  let html = template;
  for (const name of MARKERS) html = html.replace(`<!-- ASTRA:${name} -->`, () => replacements[name]);
  const output = Buffer.from(html), indexPath = join(resolve(outDir), 'index.html');
  await mkdir(dirname(indexPath), {recursive: true});
  await atomicWrite(indexPath, output);
  await atomicWrite(join(dirname(indexPath), 'README.txt'), '伴星 ASTRA · 独立素材展示\n\n双击 index.html 即可浏览。只需移动这一个 HTML 文件，不依赖游戏工程、服务器或网络。\nPNG、像素字体、完整字体许可与原创音频合成代码均内嵌；素材未重绘。\n声音在点击试听后由浏览器合成，不会自动播放。\n');
  return {indexPath, bytes: output.length, assets: manifest.assets.length, frames, cues: audio.cues.length, sha256: sha(output), verifiedGodot: verifyGodot};
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const options = {}, args = process.argv.slice(2);
    for (let index = 0; index < args.length; index++) {
      if (args[index] === '--no-verify-godot') options.verifyGodot = false;
      else if (args[index] === '--out' && args[index + 1]) options.outDir = resolve(args[++index]);
      else if (args[index] === '--root' && args[index + 1]) options.repoRoot = resolve(args[++index]);
      else throw new Error('Usage: build.mjs [--out DIR] [--root DIR] [--no-verify-godot]');
    }
    const result = await buildWorkbench(options);
    console.log(`Asset workbench: ${result.assets} assets, ${result.frames} frames, ${result.cues} cues; ${result.bytes} bytes; Godot verification ${result.verifiedGodot ? 'passed' : 'disabled'}; ${relative(process.cwd(), result.indexPath)}`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
