import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
const meta = JSON.parse(await readFile('dist/guest-meta.json', 'utf8'));
const packages = new Set(Object.keys(meta.inputs).filter(p => p.includes('node_modules/')).map(p => {
  const parts = p.split('node_modules/').at(-1).split('/');
  return parts[0].startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}));
for (const name of ['quickjs-emscripten-core','@jitl/quickjs-wasmfile-release-sync']) packages.add(name);
await mkdir('dist/licenses', { recursive: true });
const manifest=[];
for (const name of [...packages].sort()) {
  const directory = `node_modules/${name}`;
  const pkg = JSON.parse(await readFile(`${directory}/package.json`, 'utf8'));
  const names = (await readdir(directory)).filter(name => /^(LICENSE|COPYING)(\..*)?$/i.test(name));
  if (!names.length && name.startsWith('@earendil-works/')) await writeFile(`dist/licenses/${name.replaceAll('/', '__')}__LICENSE`, await readFile('third-party/earendil-pi-LICENSE'));
  else if (!names.length) throw new Error(`Missing license for ${name}`);
  for (const file of names) await writeFile(`dist/licenses/${name.replaceAll('/', '__')}__${file}`, await readFile(`${directory}/${file}`));
  manifest.push({name,version:pkg.version,license:pkg.license});
}
await writeFile('dist/licenses/manifest.json', JSON.stringify(manifest, null, 2)+'\n');
