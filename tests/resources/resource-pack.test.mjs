import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm, symlink, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { syncResources } from '../../tools/resources/sync-godot-assets.mjs';

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
  await put(sourceRoot, 'content/maps/lantern-test.json', { id: 'lantern-test' });
  await put(sourceRoot, 'content/i18n/zh-Hans/ui.json', { title: '伴星' });
  await put(sourceRoot, 'third_party/fonts/fusion-pixel-12px/fusion-pixel-12px-proportional-zh_hans.otf.woff2', 'font');
  await put(sourceRoot, 'third_party/fonts/fusion-pixel-12px/LICENSES/nested/OFL.txt', 'font permission');
  return { root, sourceRoot, targetRoot, put, manifest, options: { sourceRoot, targetRoot } };
}

async function index(f) { return JSON.parse(await readFile(join(f.targetRoot, 'resource-pack.json'), 'utf8')); }

test('pack is deterministic, complete, and verify never repairs modified copies', async t => {
  const f = await fixture(t), first = await syncResources(f.options);
  assert.equal(first.mismatches.length, 0); assert.equal(first.pngs, 4);
  const pack = await index(f);
  assert.equal(pack.format, 'astra.resource-pack/1');
  assert.equal(pack.bootstrap.player, 'char.finn');
  assert.equal(pack.maps['lantern-test'], 'res://data/maps/lantern-test.json');
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
