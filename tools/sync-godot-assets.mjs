import { copyFile, mkdir, readdir, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// The Godot tree contains generated copies. Edit art/, content/, or third_party/.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const verify = process.argv.includes('--verify');
const manifest = JSON.parse(await readFile(join(root, 'art/export/manifest.json'), 'utf8'));
const copies = [
  ['art/export/manifest.json', 'godot/assets/art/manifest.json'],
  ['content/maps/lantern-test.json', 'godot/data/maps/lantern-test.json'],
  ['content/i18n/zh-Hans/ui.json', 'godot/data/i18n/zh-Hans.json'],
];
for (const asset of manifest.assets) {
  if (!/^[\w.-]+\.png$/.test(asset.file)) throw new Error(`Unsafe asset path: ${asset.file}`);
  copies.push([`art/export/${asset.file}`, `godot/assets/art/${asset.file}`]);
}
async function addFontFiles(relative = 'third_party/fonts/fusion-pixel-12px') {
  for (const entry of (await readdir(join(root, relative), { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const source = `${relative}/${entry.name}`;
    if (entry.isDirectory()) await addFontFiles(source);
    else if (entry.isFile()) copies.push([source, source.replace('third_party/fonts/', 'godot/assets/fonts/')]);
  }
}
await addFontFiles();
let mismatches = 0;
for (const [source, destination] of copies) {
  const to = join(root, destination);
  if (verify) {
    let actual;
    try { actual = await readFile(to); } catch { /* Report a missing copy below. */ }
    if (!actual?.equals(await readFile(join(root, source)))) {
      console.error(`Godot resource copy differs: ${destination}`);
      mismatches++;
    }
  } else {
    await mkdir(dirname(to), { recursive: true });
    await copyFile(join(root, source), to);
  }
}
console.log(`Godot assets ${verify ? 'verify' : 'sync'}: ${copies.length} files, ${manifest.assets.length} PNGs, ${mismatches} mismatches`);
if (mismatches) process.exitCode = 1;
