import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const directory = await mkdtemp(join(tmpdir(), 'pi-wasm-package-'));
try {
  const packed = JSON.parse(execFileSync('npm', ['pack', '--json', '--pack-destination', directory], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }))[0];
  await writeFile(join(directory, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
  execFileSync('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', join(directory, packed.filename)], { cwd: directory, stdio: 'inherit' });
  await writeFile(join(directory, 'smoke.mjs'), `
    import assert from 'node:assert/strict';
    import { PiWasmAgent } from 'pi-wasm-kit';
    import { openNodeJournal } from 'pi-wasm-kit/node';
    import { openBrowserJournal } from 'pi-wasm-kit/browser';
    import { openAICompatible } from 'pi-wasm-kit/openai';
    assert.equal(typeof openBrowserJournal, 'function'); assert.equal(typeof openAICompatible, 'function');
    const model = async () => ({ role:'assistant', api:'host', provider:'host', model:'test', content:[{type:'text',text:'installed package works'}], stopReason:'stop', timestamp:Date.now(), usage:{input:0,output:0,cacheRead:0,cacheWrite:0,totalTokens:0,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}} });
    let agent = await PiWasmAgent.open({ journal: await openNodeJournal('journal.jsonl'), model });
    const {id} = await agent.submit('hello', 'package-request');
    await agent.wait(id); await agent.close();
    agent = await PiWasmAgent.open({ journal: await openNodeJournal('journal.jsonl'), model });
    assert.equal((await agent.submit('hello','package-request')).id,id);
    assert.match(JSON.stringify(await agent.view()), /installed package works/);
    await agent.close();
    console.log('Installed tarball: all four exports, real WASM execution, persistence and reopen passed.');
  `);
  execFileSync(process.execPath, ['smoke.mjs'], { cwd: directory, stdio: 'inherit' });
  const manifest = JSON.parse(await readFile(join(directory, 'node_modules/pi-wasm-kit/dist/licenses/manifest.json'), 'utf8'));
  if (!manifest.some(entry => entry.name === '@earendil-works/pi-durable')) throw new Error('Missing bundled license manifest');
} finally { await rm(directory, { recursive: true, force: true }); }
