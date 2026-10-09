import { MemoryStorage, type StorageWrite, type Seq } from '@earendil-works/pi-durable';
import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context';
import type { JournalCommit } from '../types.js';
declare const __host: (name: string, value: string) => Promise<string>;
export class JournalStorage extends MemoryStorage {
  static async open() {
    const storage = new JournalStorage();
    const commits: JournalCommit[] = JSON.parse(await __host('load', '{}'));
    let expected = 1;
    for (const commit of commits) {
      if (commit.seq !== expected++) throw new Error('Journal sequence is corrupt');
      storage.prepareCommit(commit.writes, commit.seq as Seq).apply();
    }
    return storage;
  }
  override async commit(writes: readonly StorageWrite[]) {
    const prepared = this.prepareCommit(writes);
    await __host('append', JSON.stringify({ seq: prepared.seq, writes: prepared.writes }));
    return prepared.apply();
  }
  override async close() { await super.close(BACKGROUND_CONTEXT); }
}
