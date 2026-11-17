// Writes a copy of the game laid out for a claude.ai artifact preview:
//   node scripts/preview-page.mjs <out-dir>
// The artifact host adds its own <!doctype>, <head> and <body>, so the page is published as a
// fragment. Modules stay separate files next to it, and three loads from the import map's CDN.
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(process.argv[2] || join(root, 'preview'));

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(join(root, 'src'), join(out, 'src'), { recursive: true });
// Artifacts do not serve .glb files, so each model ships as a base64 module instead.
mkdirSync(join(out, 'models'), { recursive: true });
for (const name of readdirSync(join(root, 'models'))) {
  if (!name.endsWith('.glb')) continue;
  const b64 = readFileSync(join(root, 'models', name)).toString('base64');
  writeFileSync(join(out, 'models', name + '.js'), 'export default "' + b64 + '";\n');
}

const page = readFileSync(join(root, 'index.html'), 'utf8')
  .replace(/<!doctype html>\s*/i, '')
  .replace(/<\/?html[^>]*>\s*/gi, '')
  .replace(/<\/?head>\s*/gi, '')
  .replace(/<\/?body[^>]*>\s*/gi, '')
  .replace(/<meta charset="utf-8">\s*/i, '')
  .replace(/<meta name="viewport"[^>]*>\s*/i, '');

writeFileSync(join(out, 'index.html'), page);
console.log('Preview page written to ' + out);
