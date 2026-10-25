import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm, symlink, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { syncResources } from '../../tools/resources/sync-godot-assets.mjs';
import {createHash} from 'node:crypto';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'astra-resource-pack-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const sourceRoot = join(root, 'source'), targetRoot = join(root, 'godot');
  await mkdir(targetRoot, { recursive: true });
  const put = async (base, relative, value) => {
    const file = join(base, relative); await mkdir(dirname(file), { recursive: true });
    await writeFile(file, typeof value === 'object' ? JSON.stringify(value) : value);
  };
  const assets = ['char.finn', 'prop.shadow', 'ui.panel', 'prop.old'].map(id => ({ id, file: `${id}.png` }));
  const manifest = { format: 'astra.art/1', assets };
  await put(sourceRoot, 'resources/art/export/manifest.json', manifest);
  for (const asset of assets) await put(sourceRoot, `resources/art/export/${asset.file}`, `original:${asset.id}`);
  const registry = {
    format: 'astra.content-registry/1',
    maps: { 'lantern.test': 'maps/lantern-test.json', 'lv.finn_house': 'maps/prologue/lv-finn_house.json' },
    locales: { 'zh-Hans': 'i18n/zh-Hans/ui.json' },
    bootstrap: { map: 'lv.finn_house', locale: 'zh-Hans' },
  };
  await put(sourceRoot, 'content/registry.json', registry);
  await put(sourceRoot, 'content/maps/lantern-test.json', { id: 'lantern.test' });
  await put(sourceRoot, 'content/maps/prologue/lv-finn_house.json', { id: 'lv.finn_house' });
  await put(sourceRoot, 'content/i18n/zh-Hans/ui.json', { title: '伴星' });
  await put(sourceRoot, 'third_party/fonts/fusion-pixel-12px/fusion-pixel-12px-proportional-zh_hans.otf.woff2', 'font');
  await put(sourceRoot, 'third_party/fonts/fusion-pixel-12px/LICENSES/nested/OFL.txt', 'font permission');
  return { root, sourceRoot, targetRoot, put, manifest, registry, options: { sourceRoot, targetRoot } };
}

async function index(f) { return JSON.parse(await readFile(join(f.targetRoot, 'resource-pack.json'), 'utf8')); }

test('cinematics and independent locale bundles keep byte provenance and reject duplicate text keys',async t=>{
  const f=await fixture(t);
  f.registry.cinematics={prologue:'story/prologue-scenes.json'};
  f.registry.locale_bundles={'zh-Hans':{prologue:'i18n/zh-Hans/prologue.json'}};
  await f.put(f.sourceRoot,'content/registry.json',f.registry);
  const scenes={format:'astra.prologue/1',scenes:[]},words={'prologue.line':'灯不会自己亮。'};
  await f.put(f.sourceRoot,'content/story/prologue-scenes.json',scenes);
  await f.put(f.sourceRoot,'content/i18n/zh-Hans/prologue.json',words);
  await syncResources(f.options);const pack=await index(f);
  assert.equal(pack.cinematics.prologue,'res://data/story/prologue-scenes.json');
  assert.equal(pack.locale_bundles['zh-Hans'].prologue,'res://data/i18n/zh-Hans/prologue.json');
  assert.deepEqual(JSON.parse(await readFile(join(f.targetRoot,'data/i18n/zh-Hans/prologue.json'),'utf8')),words);
  const before=await readFile(join(f.targetRoot,'resource-pack.json'));
  await f.put(f.sourceRoot,'content/i18n/zh-Hans/prologue.json',{title:'cannot silently replace old text'});
  await assert.rejects(syncResources(f.options),/duplicate.*text/i);
  assert.deepEqual(await readFile(join(f.targetRoot,'resource-pack.json')),before);
  f.registry.locale_bundles['zh-Hans'].prologue='../outside.json';await f.put(f.sourceRoot,'content/registry.json',f.registry);
  await assert.rejects(syncResources(f.options),/unsafe.*locale/i);
});

test('PCM16 audio is indexed by semantic ID, byte-identical and protected by read-only verify',async t=>{
  const f=await fixture(t),sha=b=>createHash('sha256').update(b).digest('hex');
  const wav=Buffer.alloc(48);wav.write('RIFF');wav.writeUInt32LE(40,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);
  wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(44100,24);wav.writeUInt32LE(88200,28);
  wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(4,40);
  await f.put(f.sourceRoot,'resources/audio/synth.ts','original source');
  const folder=join(f.sourceRoot,'resources/audio/export');await mkdir(folder,{recursive:true});
  await writeFile(join(folder,'tap.wav'),wav);
  const manifest={format:'astra.audio/1',sampleFormat:'pcm16',sampleRate:44100,source_sha256:sha('original source'),cues:[{id:'tap',file:'tap.wav',kind:'effect',sampleRate:44100,frames:2,bytes:48,sha256:sha(wav)}]};
  await f.put(f.sourceRoot,'resources/audio/export/manifest.json',manifest);
  await syncResources(f.options);
  assert.deepEqual((await index(f)).audio.tap,{path:'res://resources/audio/tap.wav',kind:'effect',frames:2,sample_rate:44100});
  assert.deepEqual(await readFile(join(f.targetRoot,'resources/audio/tap.wav')),wav);
  await writeFile(join(f.targetRoot,'resources/audio/tap.wav'),'edited');
  assert.ok((await syncResources({...f.options,verify:true})).mismatches.some(m=>m.includes('tap.wav')));
  assert.equal(await readFile(join(f.targetRoot,'resources/audio/tap.wav'),'utf8'),'edited');
  manifest.extra='x'.repeat(2_000_000);await f.put(f.sourceRoot,'resources/audio/export/manifest.json',manifest);
  const before=await readFile(join(f.targetRoot,'resource-pack.json'));
  await assert.rejects(syncResources(f.options),/budget|oversized/i);
  assert.deepEqual(await readFile(join(f.targetRoot,'resource-pack.json')),before);delete manifest.extra;
  manifest.cues[0].file='../escape.wav';await f.put(f.sourceRoot,'resources/audio/export/manifest.json',manifest);
  await assert.rejects(syncResources(f.options),/Invalid audio cue/);
  manifest.cues[0].file='tap.wav';await f.put(f.sourceRoot,'resources/audio/export/manifest.json',manifest);
  await writeFile(join(folder,'tap.wav'),'bad');await assert.rejects(syncResources(f.options),/Audio WAV/);
});

test('pack is deterministic, complete, and verify never repairs modified copies', async t => {
  const f = await fixture(t), first = await syncResources(f.options);
  assert.equal(first.mismatches.length, 0); assert.equal(first.pngs, 4);
  const pack = await index(f);
  assert.equal(pack.format, 'astra.resource-pack/1');
  assert.equal(pack.bootstrap.player, 'char.finn');
  assert.equal(pack.bootstrap.map, 'lv.finn_house');
  assert.equal(pack.maps['lv.finn_house'], 'res://data/maps/prologue/lv-finn_house.json');
  assert.equal(JSON.parse(await readFile(join(f.targetRoot, 'data/maps/prologue/lv-finn_house.json'), 'utf8')).id, 'lv.finn_house');
  assert.equal(pack.maps['lantern.test'], 'res://data/maps/lantern-test.json');
  assert.equal(pack.locales['zh-Hans'], 'res://data/i18n/zh-Hans.json');
  assert.ok(pack.files.some(file => file.path.endsWith('LICENSES/nested/OFL.txt')));
  assert.ok(pack.files.every(file => /^[a-f0-9]{64}$/.test(file.sha256) && file.bytes > 0));
  const bytes = await readFile(join(f.targetRoot, 'resource-pack.json'));
  await syncResources(f.options);
  assert.deepEqual(await readFile(join(f.targetRoot, 'resource-pack.json')), bytes);
  assert.equal((await syncResources({ ...f.options, verify: true })).mismatches.length, 0);
  await f.put(f.targetRoot, 'resources/art/char.finn.png', 'manual edit');
  const result = await syncResources({ ...f.options, verify: true });
  assert.ok(result.mismatches.some(message => message.includes('char.finn.png')));
  assert.equal(await readFile(join(f.targetRoot, 'resources/art/char.finn.png'), 'utf8'), 'manual edit');
});

test('verify detects missing files, changed source and stale index without writing', async t => {
  const f = await fixture(t); await syncResources(f.options);
  await rm(join(f.targetRoot, 'resources/art/prop.shadow.png'));
  await f.put(f.sourceRoot, 'resources/art/export/ui.panel.png', 'new panel');
  const oldIndex = await readFile(join(f.targetRoot, 'resource-pack.json'));
  const result = await syncResources({ ...f.options, verify: true });
  assert.equal(result.mismatches.length, 3);
  assert.deepEqual(await readFile(join(f.targetRoot, 'resource-pack.json')), oldIndex);
  await assert.rejects(access(join(f.targetRoot, 'resources/art/prop.shadow.png')));
});

test('sync removes only unchanged old indexed files and preserves unknown user files', async t => {
  const f = await fixture(t); await syncResources(f.options);
  await f.put(f.targetRoot, 'resources/art/user-note.txt', 'keep me');
  f.manifest.assets.pop(); await f.put(f.sourceRoot, 'resources/art/export/manifest.json', f.manifest);
  const result = await syncResources(f.options);
  assert.deepEqual(result.removed, ['res://resources/art/prop.old.png']);
  await assert.rejects(access(join(f.targetRoot, 'resources/art/prop.old.png')));
  assert.equal(await readFile(join(f.targetRoot, 'resources/art/user-note.txt'), 'utf8'), 'keep me');
  assert.equal((await syncResources({ ...f.options, verify: true })).mismatches.length, 0);
});

test('sync refuses to delete an old managed file changed after its recorded generation', async t => {
  const f = await fixture(t); await syncResources(f.options);
  f.manifest.assets.pop(); await f.put(f.sourceRoot, 'resources/art/export/manifest.json', f.manifest);
  await f.put(f.targetRoot, 'resources/art/prop.old.png', 'manual change');
  await assert.rejects(syncResources(f.options), /modified stale resource/i);
  assert.equal(await readFile(join(f.targetRoot, 'resources/art/prop.old.png'), 'utf8'), 'manual change');
});

test('unsafe source paths and forged old index paths fail before any writes', async t => {
  const f = await fixture(t);
  f.manifest.assets.push({ id: 'unsafe', file: '../../../outside.png' });
  await f.put(f.sourceRoot, 'resources/art/export/manifest.json', f.manifest);
  await assert.rejects(syncResources(f.options), /unsafe asset path/i);
  await assert.rejects(access(join(f.targetRoot, 'resource-pack.json')));
  f.manifest.assets.pop(); await f.put(f.sourceRoot, 'resources/art/export/manifest.json', f.manifest);
  await syncResources(f.options); const pack = await index(f);
  pack.files[0].path = 'res://../outside.txt'; await f.put(f.targetRoot, 'resource-pack.json', pack);
  await assert.rejects(syncResources(f.options), /unsafe|invalid/i);
});

test('source and output symlinks are rejected, including an unsafe index symlink', async t => {
  const f = await fixture(t);
  await f.put(f.root, 'outside.txt', 'keep');
  const source = join(f.sourceRoot, 'resources/art/export/char.finn.png');
  await rm(source); await symlink(join(f.root, 'outside.txt'), source);
  await assert.rejects(syncResources(f.options), /symbolic link/i);
  await rm(source); await writeFile(source, 'original'); await syncResources(f.options);
  const destination = join(f.targetRoot, 'resources/art/char.finn.png');
  await rm(destination); await symlink(join(f.root, 'outside.txt'), destination);
  await assert.rejects(syncResources(f.options), /symbolic link/i);
  assert.equal(await readFile(join(f.root, 'outside.txt'), 'utf8'), 'keep');
  await rm(destination); await writeFile(destination, 'original');
  const indexPath = join(f.targetRoot, 'resource-pack.json'); await rm(indexPath);
  await symlink(join(f.root, 'outside.txt'), indexPath);
  await assert.rejects(syncResources(f.options), /symbolic link/i);
});


test('output directory symlinks and missing pack indices fail verification without repair', async t => {
  const f = await fixture(t);
  const missing = await syncResources({ ...f.options, verify: true });
  assert.ok(missing.mismatches.some(message => message.includes('index')));
  await assert.rejects(access(join(f.targetRoot, 'resource-pack.json')));
  await mkdir(join(f.targetRoot, 'resources'), { recursive: true });
  await mkdir(join(f.root, 'external-art'));
  await symlink(join(f.root, 'external-art'), join(f.targetRoot, 'resources/art'));
  await assert.rejects(syncResources(f.options), /symbolic link/i);
  await assert.rejects(access(join(f.root, 'external-art/char.finn.png')));
});


test('registered map and locale additions drive the package without tool changes', async t => {
  const f = await fixture(t);
  f.registry.maps['lv.garden'] = 'maps/optional/garden.json';
  f.registry.locales.en = 'i18n/en/ui.json';
  f.registry.bootstrap = { map: 'lv.garden', locale: 'en' };
  await f.put(f.sourceRoot, 'content/maps/optional/garden.json', { id: 'lv.garden' });
  await f.put(f.sourceRoot, 'content/i18n/en/ui.json', { title: 'ASTRA' });
  await f.put(f.sourceRoot, 'content/registry.json', f.registry);
  await syncResources(f.options);
  const pack = await index(f);
  assert.equal(pack.maps['lv.garden'], 'res://data/maps/optional/garden.json');
  assert.equal(pack.locales.en, 'res://data/i18n/en.json');
  assert.deepEqual(pack.bootstrap, { map: 'lv.garden', locale: 'en', player: 'char.finn', shadow: 'prop.shadow', panel: 'ui.panel' });
  assert.equal((await syncResources({ ...f.options, verify: true })).mismatches.length, 0);
});

test('invalid registry shapes and paths fail before creating a package', async t => {
  const cases = [
    [registry => { registry.format = 'astra.content-registry/99'; }, /invalid content registry/i],
    [registry => { registry.maps = []; }, /invalid.*maps/i],
    [registry => { registry.maps = null; }, /invalid.*maps/i],
    [registry => { registry.locales = []; }, /invalid.*locales/i],
    [registry => { registry.bootstrap = null; }, /invalid.*bootstrap/i],
    [registry => { registry.maps['lv.finn_house'] = '../outside.json'; }, /unsafe.*map path/i],
    [registry => { registry.maps['lv.finn_house'] = 'maps/../i18n/zh-Hans/ui.json'; }, /unsafe.*map path/i],
    [registry => { registry.maps['lv.finn_house'] = '/maps/prologue/lv-finn_house.json'; }, /unsafe.*map path/i],
    [registry => { registry.maps['lv.finn_house'] = 'maps\\outside.json'; }, /unsafe.*map path/i],
    [registry => { registry.maps['lv.finn_house'] = 'i18n/zh-Hans/ui.json'; }, /unsafe.*map path/i],
    [registry => { registry.maps['../escape'] = 'maps/lantern-test.json'; }, /invalid.*map id/i],
    [registry => { registry.locales['zh-Hans'] = 'maps/lantern-test.json'; }, /unsafe.*locale path/i],
    [registry => { registry.locales['zh-Hans'] = 'i18n/en/ui.json'; }, /unsafe.*locale path/i],
    [registry => { registry.locales['zh-Hans'] = 'i18n/zh-Hans/../ui.json'; }, /unsafe.*locale path/i],
  ];
  for (const [mutate, expected] of cases) {
    const f = await fixture(t); mutate(f.registry);
    await f.put(f.sourceRoot, 'content/registry.json', f.registry);
    await assert.rejects(syncResources(f.options), expected);
    await assert.rejects(access(join(f.targetRoot, 'resource-pack.json')));
    await assert.rejects(access(join(f.targetRoot, 'data/maps/lantern-test.json')));
  }
});

test('unknown bootstrap maps and locales are rejected including inherited property names', async t => {
  for (const bootstrap of [
    { map: 'lv.missing', locale: 'zh-Hans' },
    { map: 'constructor', locale: 'zh-Hans' },
    { map: 'lv.finn_house', locale: 'en' },
    { map: 'lv.finn_house', locale: 'toString' },
  ]) {
    const f = await fixture(t); f.registry.bootstrap = bootstrap;
    await f.put(f.sourceRoot, 'content/registry.json', f.registry);
    await assert.rejects(syncResources(f.options), /unknown bootstrap (map|locale)/i);
    await assert.rejects(access(join(f.targetRoot, 'resource-pack.json')));
  }
});

test('map internal IDs must agree with registration keys', async t => {
  const f = await fixture(t);
  await f.put(f.sourceRoot, 'content/maps/prologue/lv-finn_house.json', { id: 'lv.other_house' });
  await assert.rejects(syncResources(f.options), /map id mismatch.*lv.finn_house/i);
  await assert.rejects(access(join(f.targetRoot, 'resource-pack.json')));
});

test('changed registration is detected read-only and removes only owned obsolete maps on sync', async t => {
  const f = await fixture(t); await syncResources(f.options);
  delete f.registry.maps['lantern.test'];
  await f.put(f.sourceRoot, 'content/registry.json', f.registry);
  await f.put(f.targetRoot, 'data/maps/user-draft.json', { id: 'user.draft' });
  const result = await syncResources({ ...f.options, verify: true });
  assert.ok(result.mismatches.some(message => message.includes('index')));
  await access(join(f.targetRoot, 'data/maps/lantern-test.json'));
  assert.deepEqual((await syncResources(f.options)).removed, ['res://data/maps/lantern-test.json']);
  await assert.rejects(access(join(f.targetRoot, 'data/maps/lantern-test.json')));
  await access(join(f.targetRoot, 'data/maps/user-draft.json'));
});

test('registered story bundles are managed, verified, and removable without touching drafts', async t => {
  const f = await fixture(t);
  f.registry.stories = { village: 'story/village.json' };
  const scripts = { greeting: [{ op: 'end' }] };
  await f.put(f.sourceRoot, 'content/story/village.json', scripts);
  await f.put(f.sourceRoot, 'content/registry.json', f.registry);
  await syncResources(f.options);
  assert.equal((await index(f)).stories.village, 'res://data/story/village.json');
  assert.deepEqual(JSON.parse(await readFile(join(f.targetRoot, 'data/story/village.json'), 'utf8')), scripts);
  await f.put(f.targetRoot, 'data/story/draft.json', { keep: true });
  await f.put(f.targetRoot, 'data/story/village.json', 'edited');
  assert.ok((await syncResources({...f.options,verify:true})).mismatches.some(v=>v.includes('story/village.json')));
  await syncResources(f.options);
  f.registry.stories = {};
  await f.put(f.sourceRoot, 'content/registry.json', f.registry);
  assert.deepEqual((await syncResources(f.options)).removed, ['res://data/story/village.json']);
  await access(join(f.targetRoot,'data/story/draft.json'));
});

test('story registration rejects unsafe paths and malformed bundles before writing', async t => {
  for (const stories of [null, [], {village:'../escape.json'}, {village:'maps/lantern-test.json'}, {'../bad':'story/village.json'}]) {
    const f = await fixture(t);f.registry.stories = stories;
    await f.put(f.sourceRoot,'content/registry.json',f.registry);
    await assert.rejects(syncResources(f.options), /stor|unsafe/i);
    await assert.rejects(access(join(f.targetRoot,'resource-pack.json')));
  }
  const f = await fixture(t);f.registry.stories={village:'story/village.json'};
  await f.put(f.sourceRoot,'content/registry.json',f.registry);
  await f.put(f.sourceRoot,'content/story/village.json',['not a keyed script dictionary']);
  await assert.rejects(syncResources(f.options), /story bundle/i);
});

test('registered rule tables are byte-identical managed content, independent from game scripts', async t => {
  const f=await fixture(t);f.registry.tables={'battle.skills':'data/battle-skills.json'};
  const data={rules:{guardShield:20},skills:[{id:'basic_strike',power:16}]};
  await f.put(f.sourceRoot,'content/data/battle-skills.json',data);
  await f.put(f.sourceRoot,'content/registry.json',f.registry);
  await syncResources(f.options);
  assert.equal((await index(f)).tables?.['battle.skills'],'res://data/tables/battle-skills.json');
  assert.deepEqual(JSON.parse(await readFile(join(f.targetRoot,'data/tables/battle-skills.json'),'utf8')),data);
  await f.put(f.targetRoot,'data/tables/battle-skills.json',{changed:true});
  assert.ok((await syncResources({...f.options,verify:true})).mismatches.some(v=>v.includes('battle-skills.json')));
});

test('rule table registry rejects malformed values and traversal before writing', async t => {
  for(const tables of [[],null,{'battle.skills':'../outside.json'},{'battle.skills':'maps/lantern-test.json'},{'bad/id':'data/battle.json'}]){
    const f=await fixture(t);f.registry.tables=tables;
    await f.put(f.sourceRoot,'content/registry.json',f.registry);
    await assert.rejects(syncResources(f.options),/table|unsafe/i);
    await assert.rejects(access(join(f.targetRoot,'resource-pack.json')));
  }
});

test('original palette can be managed for exact-color native presentation effects', async t => {
  const f=await fixture(t);const palette={format:'astra.palette/1',colors:[{char:'A',name:'ink',hex:'#1a1220',ramp:'outline'}]};
  await f.put(f.sourceRoot,'resources/art/palette.json',palette);
  await syncResources(f.options);
  assert.equal((await index(f)).palette,'res://resources/art/palette.json');
  assert.deepEqual(JSON.parse(await readFile(join(f.targetRoot,'resources/art/palette.json'),'utf8')),palette);
});
