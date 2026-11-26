import MiniSearch from 'minisearch';
import type { Note } from './db';

type Doc = Pick<Note, 'id' | 'title' | 'plainText'>;

/**
 * In-memory full-text index, kept in sync incrementally:
 * only notes whose updatedAt changed are re-indexed.
 */
class NoteSearch {
  private index = new MiniSearch<Doc>({
    fields: ['title', 'plainText'],
    storeFields: [],
    searchOptions: { boost: { title: 3 }, prefix: true, fuzzy: 0.2, combineWith: 'AND' },
  });
  private versions = new Map<string, number>();

  sync(notes: Note[]) {
    const live = new Set<string>();
    for (const n of notes) {
      live.add(n.id);
      const v = this.versions.get(n.id);
      if (v === n.updatedAt) continue;
      const doc = { id: n.id, title: n.title, plainText: n.plainText };
      if (v === undefined) this.index.add(doc);
      else this.index.replace(doc);
      this.versions.set(n.id, n.updatedAt);
    }
    for (const id of [...this.versions.keys()]) {
      if (!live.has(id)) {
        this.index.discard(id);
        this.versions.delete(id);
      }
    }
  }

  /** Returns note ids ranked by relevance. */
  search(query: string): string[] {
    const q = query.trim();
    if (!q) return [];
    return this.index.search(q).map(r => r.id as string);
  }
}

export const noteSearch = new NoteSearch();
