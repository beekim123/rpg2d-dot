import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm, cp, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import vm from 'node:vm';
import { buildWorkbench } from '../../tools/workbench/build.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64');
const font = Buffer.from('font bytes unchanged');
const synth = `export const cues = ['tap'] as const;
export const cueKinds = {tap: 'effect'} as const;
export const cueDurations = {tap: 0.125};
const marker = '</script><!--';
export function renderCue(id: string, sampleRate = 44100): Float32Array | string { if (id === 'marker') return marker; return new Float32Array([id.length, sampleRate]); }
`;
const template = '<!doctype html><html><head><!-- ASTRA:STYLE --></head><body><main>素材</main><!-- ASTRA:DATA --><!-- ASTRA:SYNTH --><!-- ASTRA:VIEWER --></body></html>';
async function fixture(t) {
  const temp = await mkdtemp(join(tmpdir(), 'astra-workbench-'));
  t.after(() => rm(temp, {recursive: true, force: true}));
  const root = join(temp, 'input'), outDir = join(temp, 'output');
  const put = async (relative, value) => {
    const file = join(root, relative); await mkdir(dirname(file), {recursive: true});
    await writeFile(file, typeof value === 'object' && !Buffer.isBuffer(value) ? JSON.stringify(value) : value);
  };
  const manifest = {format: 'astra.art/1', assets: [
    {id: 'char.demo', file: 'char.demo.png', hash: sha(png), frames: 1, size: [1, 1], anchor: [0, 1], category: 'character', animations: {idle: {frames: [0], fps: 2, loop: true}}},
    {id: 'tile.demo', file: 'tile.demo.png', hash: sha(png), frames: 1, size: [1, 1], anchor: [0, 1], category: 'tile', animations: {}},
  ], note: '</script><script src="https://example.invalid/attack.js">'};
  await put('resources/art/export/manifest.json', manifest);
  await put('godot/resources/art/manifest.json', manifest);
  for (const entry of manifest.assets) {
    await put(`resources/art/export/${entry.file}`, png);
    await put(`godot/resources/art/${entry.file}`, png);
  }
  await put('resources/art/palette.json', {format: 'astra.palette/1', colors: [{name: 'ink', char: 'A', hex: '#1a1220', ramp: 'outline'}]});
  await put('resources/audio/synth.ts', synth);
  await put('third_party/fonts/fusion-pixel-12px/fusion-pixel-12px-proportional-zh_hans.otf.woff2', font);
  await put('godot/resources/fonts/fusion-pixel-12px/fusion-pixel-12px-proportional-zh_hans.otf.woff2', font);
  await put('third_party/fonts/fusion-pixel-12px/OFL.txt', 'Full font license <terms>');
  await put('third_party/fonts/fusion-pixel-12px/LICENSES/component/LICENSE.txt', 'Complete component permission');
  await put('workbench/index.html', template);
  await put('workbench/style.css', 'body{color:#123}');
  await put('workbench/viewer.js', "window.VIEWER_MARKER = '</SCRIPT><!--';");
  await put('workbench/audio-labels.json', {tap: '轻触</script>'});
  return {root, outDir, temp, put, manifest, options: {repoRoot: root, outDir}};
}
function payload(html) {
  return JSON.parse(/<script\b[^>]*id="astra-workbench-data"[^>]*>([\s\S]*?)<\/script>/i.exec(html)[1]);
}
function runInline(html) {
  const context = {window: {}};
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (match[1].includes('application/json')) continue;
    vm.runInNewContext(match[2], context, {timeout: 1000});
  }
  return context.window;
}

test('self-contained bundle embeds canonical PNG/font bytes, complete licenses and synth metadata', async t => {
  const f = await fixture(t), result = await buildWorkbench(f.options);
  assert.equal(result.assets, 2); assert.equal(result.cues, 1); assert.equal(result.verifiedGodot, true);
  const html = await readFile(result.indexPath, 'utf8'), data = payload(html);
  assert.equal(data.format, 'astra.workbench/1'); assert.deepEqual(data.art.manifest, f.manifest);
  assert.equal(data.art.manifest_json, await readFile(join(f.root, 'resources/art/export/manifest.json'), 'utf8'));
  assert.deepEqual(Buffer.from(data.art.pngs['char.demo'].split(',')[1], 'base64'), png);
  assert.deepEqual(Buffer.from(data.font.data_url.split(',')[1], 'base64'), font);
  assert.equal(data.font.licenses.length, 2);
  assert.ok(data.font.licenses.some(license => license.text === 'Complete component permission'));
  assert.equal(data.audio.source_sha256, sha(Buffer.from(synth)));
  assert.deepEqual(data.audio.cues, [{id: 'tap', label: '轻触</script>', kind: 'effect', duration: 0.125}]);
  const runtime = runInline(html);
  assert.equal(runtime.ASTRA_SYNTH.renderCue('marker'), '</script><!--');
  assert.deepEqual(Object.keys(runtime.ASTRA_SYNTH).sort(), ['cueDurations', 'cueKinds', 'cues', 'renderCue']);
  assert.deepEqual(Array.from(runtime.ASTRA_SYNTH.renderCue('tap', 8000)), [3, 8000]);
  assert.equal(runtime.VIEWER_MARKER, '</SCRIPT><!--');
});

test('HTML can be moved away from all source files and has no runtime module or external asset dependencies', async t => {
  const f = await fixture(t), built = await buildWorkbench(f.options);
  const moved = join(f.temp, 'portable.html'); await cp(built.indexPath, moved);
  await rm(f.root, {recursive: true, force: true}); await rm(f.outDir, {recursive: true, force: true});
  const html = await readFile(moved, 'utf8'), data = payload(html), runtime = runInline(html);
  assert.deepEqual(Buffer.from(data.art.pngs['tile.demo'].split(',')[1], 'base64'), png);
  assert.deepEqual(Buffer.from(data.font.data_url.split(',')[1], 'base64'), font);
  assert.equal(typeof runtime.ASTRA_SYNTH.renderCue, 'function');
  assert.doesNotMatch(html, /<(?:script|link|img|iframe)\b[^>]*(?:src|href)\s*=\s*["'](?:\.\.?\/|https?:|\/)/i);
  assert.doesNotMatch(html, /\bimport\s*(?:\(|["'{*])|\brequire\s*\(/);
  assert.equal((html.match(/<script\b/gi) ?? []).length, 3);
  assert.equal((html.match(/<\/script\s*>/gi) ?? []).length, 3);
});

test('builder rejects every source PNG hash mismatch and stale Godot copy/manifest/font before writing', async t => {
  for (const [file, expected] of [
    ['resources/art/export/tile.demo.png', /hash mismatch/i],
    ['godot/resources/art/tile.demo.png', /godot.*differs/i],
    ['godot/resources/art/manifest.json', /godot.*manifest.*differs/i],
    ['godot/resources/fonts/fusion-pixel-12px/fusion-pixel-12px-proportional-zh_hans.otf.woff2', /godot.*font.*differs/i],
  ]) {
    const f = await fixture(t); await f.put(file, 'tampered');
    await assert.rejects(buildWorkbench(f.options), expected);
    await assert.rejects(access(join(f.outDir, 'index.html')));
  }
});

test('source-only builds work without a Godot or game tree when verification is explicitly disabled', async t => {
  const f = await fixture(t); await rm(join(f.root, 'godot'), {recursive: true});
  const result = await buildWorkbench({...f.options, verifyGodot: false});
  assert.equal(result.verifiedGodot, false);
  assert.equal(payload(await readFile(result.indexPath, 'utf8')).art.manifest.assets.length, 2);
});

test('unsafe manifest paths, missing labels, template markers and synth imports are rejected', async t => {
  const cases = [
    async f => { f.manifest.assets[0].file = '../../escape.png'; await f.put('resources/art/export/manifest.json', f.manifest); },
    async f => f.put('workbench/audio-labels.json', {}),
    async f => f.put('workbench/index.html', template.replace('<!-- ASTRA:VIEWER -->', '')),
    async f => f.put('workbench/index.html', template + '<!-- ASTRA:DATA -->'),
    async f => f.put('resources/audio/synth.ts', "import {x} from '../reference/game.js';\n" + synth),
    async f => f.put('resources/audio/synth.ts', synth + "\nexport const extra = () => import('./more.js');"),
    async f => f.put('workbench/viewer.js', "import './game.js';"),
    async f => f.put('workbench/style.css', '@import "../../game/style.css";'),
    async f => f.put('workbench/style.css', 'body{background:url(../game/art.png)}'),
    async f => f.put('workbench/index.html', template.replace('<main>', '<img src=../game/art.png><main>')),
    async f => f.put('workbench/viewer.js', 'fetch("../game/data.json");'),
  ];
  for (const mutate of cases) {
    const f = await fixture(t); await mutate(f);
    await assert.rejects(buildWorkbench({...f.options, verifyGodot: false}), /unsafe|missing|marker|import|dependenc/i);
    await assert.rejects(access(join(f.outDir, 'index.html')));
  }
});

test('same inputs produce byte-identical standalone builds', async t => {
  const f = await fixture(t); const first = await buildWorkbench(f.options);
  const html = await readFile(first.indexPath); const next = await buildWorkbench(f.options);
  assert.equal(first.sha256, next.sha256); assert.deepEqual(await readFile(next.indexPath), html);
});
