// Fast checks that need no browser: the import map matches the installed three version,
// and every source module is type-checked.
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const threeVersion = pkg.dependencies.three;
const html = readFileSync(join(root, 'index.html'), 'utf8');
const mapped = html.match(/three@([0-9.]+)\/build\/three\.module\.js/);
if (!mapped) problems.push('index.html: the import map does not point "three" at a pinned CDN build.');
else if (mapped[1] !== threeVersion) {
  problems.push(`index.html maps three@${mapped[1]}, but package.json has three ${threeVersion}. Keep them equal.`);
}

const addons = html.match(/three@([0-9.]+)\/examples\/jsm\//);
if (!addons) problems.push('index.html: the import map has no "three/addons/" entry.');
else if (addons[1] !== threeVersion) {
  problems.push(`index.html maps three/addons from three@${addons[1]}, but package.json has three ${threeVersion}.`);
}

for (const name of readdirSync(join(root, 'models'))) {
  if (!name.endsWith('.glb')) continue;
  const head = readFileSync(join(root, 'models', name)).subarray(0, 4).toString('latin1');
  if (head !== 'glTF') problems.push(`models/${name} is not a binary glTF file.`);
}

for (const name of readdirSync(join(root, 'src'))) {
  if (!name.endsWith('.js')) continue;
  const text = readFileSync(join(root, 'src', name), 'utf8');
  if (!text.startsWith('// @ts-check')) problems.push(`src/${name}: start the file with "// @ts-check".`);
}

if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log('Checks passed.');
