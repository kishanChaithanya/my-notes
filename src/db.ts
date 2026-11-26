import Dexie, { type EntityTable } from 'dexie';
import type { JSONContent } from '@tiptap/react';

/** Fields every stored record shares. */
interface BaseRecord {
  id: string;
  createdAt: number;
  updatedAt: number;
}

export interface Folder extends BaseRecord {
  name: string;
  /** null = top level. Allows nested folders later. */
  parentId: string | null;
  sortOrder: number;
}

export interface Note extends BaseRecord {
  folderId: string;
  /** Rich document as TipTap/ProseMirror JSON — the source of truth. */
  doc: JSONContent;
  /** Derived, denormalised fields kept for fast list rendering + search. */
  title: string;
  snippet: string;
  plainText: string;
  pinned: 0 | 1; // number so it can be indexed
  hasChecklist: boolean;
  /** Soft delete: non-null means it's in "Recently Deleted". */
  deletedAt: number | null;
}

/** Binary payloads live outside the note doc; the doc references them by id. */
export interface Attachment extends BaseRecord {
  noteId: string;
  mimeType: string;
  filename: string;
  blob: Blob;
}

export const db = new Dexie('my-notes') as Dexie & {
  folders: EntityTable<Folder, 'id'>;
  notes: EntityTable<Note, 'id'>;
  attachments: EntityTable<Attachment, 'id'>;
};

db.version(1).stores({
  folders: 'id, parentId, sortOrder',
  notes: 'id, folderId, updatedAt, pinned, deletedAt',
  attachments: 'id, noteId',
});

export const DEFAULT_FOLDER_ID = 'default';

/** Virtual folders (not stored). */
export const ALL_NOTES = '__all__';
export const RECENTLY_DELETED = '__trash__';

db.on('populate', async (tx) => {
  const now = Date.now();
  await tx.table('folders').add({
    id: DEFAULT_FOLDER_ID, name: 'Notes', parentId: null, sortOrder: 0, createdAt: now, updatedAt: now,
  });
  const doc: JSONContent = {
    type: 'doc',
    content: [
      { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Welcome to My Notes' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'Everything is stored locally in IndexedDB.' }] },
      {
        type: 'taskList',
        content: [
          { type: 'taskItem', attrs: { checked: true }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Create a note' }] }] },
          { type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Try search (⌘K)' }] }] },
        ],
      },
    ],
  };
  await tx.table('notes').add({ id: crypto.randomUUID(), folderId: DEFAULT_FOLDER_ID, ...derive(doc), pinned: 1, deletedAt: null, createdAt: now, updatedAt: now });
});

// ---------- derivation ----------

function textOf(node: JSONContent): string {
  if (node.type === 'hardBreak') return ' ';
  return node.text ?? (node.content ?? []).map(textOf).join('');
}

function blocks(doc: JSONContent): string[] {
  const out: string[] = [];
  const walk = (n: JSONContent) => {
    if (n.type === 'paragraph' || n.type === 'heading' || n.type === 'codeBlock') {
      const t = textOf(n).trim();
      if (t) out.push(t);
      return;
    }
    n.content?.forEach(walk);
  };
  walk(doc);
  return out;
}

function containsType(n: JSONContent, type: string): boolean {
  return n.type === type || (n.content ?? []).some(c => containsType(c, type));
}

export function derive(doc: JSONContent) {
  const lines = blocks(doc);
  return {
    doc,
    title: lines[0]?.slice(0, 120) ?? '',
    snippet: lines.slice(1).join(' ').slice(0, 160),
    plainText: lines.join('\n'),
    hasChecklist: containsType(doc, 'taskList'),
  };
}

// ---------- mutations ----------

export async function createFolder(name: string) {
  const now = Date.now();
  const count = await db.folders.count();
  const id = crypto.randomUUID();
  await db.folders.add({ id, name, parentId: null, sortOrder: count, createdAt: now, updatedAt: now });
  return id;
}

export function renameFolder(id: string, name: string) {
  return db.folders.update(id, { name, updatedAt: Date.now() });
}

/** Deleting a folder moves its notes to Recently Deleted. */
export async function deleteFolder(id: string) {
  if (id === DEFAULT_FOLDER_ID) return;
  const now = Date.now();
  await db.transaction('rw', db.folders, db.notes, async () => {
    await db.notes.where('folderId').equals(id).modify({ deletedAt: now, folderId: DEFAULT_FOLDER_ID });
    await db.folders.delete(id);
  });
}

export async function createNote(folderId: string) {
  const now = Date.now();
  const id = crypto.randomUUID();
  const doc: JSONContent = { type: 'doc', content: [{ type: 'heading', attrs: { level: 1 } }] };
  await db.notes.add({ id, folderId, ...derive(doc), pinned: 0, deletedAt: null, createdAt: now, updatedAt: now });
  return id;
}

export function saveNoteDoc(id: string, doc: JSONContent) {
  return db.notes.update(id, { ...derive(doc), updatedAt: Date.now() });
}

export async function duplicateNote(note: Note) {
  const now = Date.now();
  const id = crypto.randomUUID();
  await db.notes.add({ ...note, id, pinned: 0, deletedAt: null, createdAt: now, updatedAt: now });
  return id;
}

export function togglePin(note: Note) {
  // Pinning is not an edit, so leave updatedAt alone.
  return db.notes.update(note.id, { pinned: note.pinned ? 0 : 1 });
}

export function trashNote(id: string) {
  return db.notes.update(id, { deletedAt: Date.now(), pinned: 0 });
}

export function restoreNote(id: string) {
  return db.notes.update(id, { deletedAt: null });
}

export async function purgeNote(id: string) {
  await db.transaction('rw', db.notes, db.attachments, async () => {
    await db.attachments.where('noteId').equals(id).delete();
    await db.notes.delete(id);
  });
}
