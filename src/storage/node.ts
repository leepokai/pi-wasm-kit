import { open, readFile, mkdir, unlink, truncate } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { Journal, JournalCommit } from '../types.js';
export async function openNodeJournal(path: string): Promise<Journal> {
  await mkdir(dirname(path), { recursive: true });
  const lockPath = `${path}.lock`;
  let lock;
  try { lock = await open(lockPath, 'wx', 0o600); }
  catch (error: any) {
    if (error.code !== 'EEXIST') throw error;
    // Serialize stale-lock reclamation, then reread the owner under that guard.
    // An abandoned reclaim guard fails closed and requires operator inspection.
    const guardPath = `${lockPath}.reclaim`;
    let guard;
    try { guard = await open(guardPath, 'wx', 0o600); }
    catch { throw new Error('Journal owner is being recovered; retry or inspect the reclaim lock'); }
    try {
      const pid = Number(await readFile(lockPath, 'utf8'));
      if (!Number.isInteger(pid) || pid <= 0) throw new Error('Journal lock is incomplete; inspect it before removing');
      try { process.kill(pid, 0); throw new Error('Journal already has an owner'); }
      catch (probe: any) { if (probe.code !== 'ESRCH') throw probe; }
      await unlink(lockPath);
      lock = await open(lockPath, 'wx', 0o600);
      // Publish ownership before releasing the reclaim guard.
      await lock.writeFile(String(process.pid)); await lock.sync();
    } finally { await guard.close(); await unlink(guardPath); }
  }
  await lock.write(String(process.pid), 0); await lock.sync();
  let file;
  try { file = await open(path, 'a+', 0o600); }
  catch (error) { await lock.close(); await unlink(lockPath); throw error; }
  let closed = false; let tail = Promise.resolve(); let expected = 1;
  return {
    async load() {
      if (closed) throw new Error('Journal is closed');
      const bytes = await readFile(path);
      const end = bytes.lastIndexOf(10) + 1;
      if (end !== bytes.length) { await truncate(path, end); await file.sync(); }
      const lines = bytes.subarray(0, end).toString('utf8').split('\n').filter(Boolean);
      const commits = lines.map((line, index) => {
        const commit = JSON.parse(line) as JournalCommit;
        if (commit.seq !== index + 1 || !Array.isArray(commit.writes)) throw new Error('Corrupt journal');
        return commit;
      });
      expected = commits.length + 1; return commits;
    },
    append(commit: JournalCommit) {
      if (closed) return Promise.reject(new Error('Journal is closed'));
      const serialized = JSON.stringify(commit) + '\n';
      const seq = commit.seq;
      const write = tail.then(async () => {
        if (seq !== expected) throw new Error('Journal sequence conflict');
        await file.writeFile(serialized); await file.sync(); expected++;
      });
      tail = write; return write;
    },
    async close() { if (closed) return; closed = true; try { await tail; } finally { await file.close(); await lock.close(); await unlink(lockPath); } },
  };
}
