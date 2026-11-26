import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  ALL_NOTES, DEFAULT_FOLDER_ID, RECENTLY_DELETED, createFolder, createNote, db, duplicateNote,
  purgeNote, restoreNote, togglePin, trashNote, type Note,
} from './db';
import { noteSearch } from './search';
import { desktop, isDesktop, loadPref, savePref, type SortBy, type SortDir } from './desktop';
import { flushActiveEditor, runEditorCommand } from './editorCommands';
import { toMarkdown } from './markdown';
import { FolderPane } from './components/FolderPane';
import { NoteList } from './components/NoteList';
import { Editor } from './components/Editor';
import './App.css';

/** A view preference that persists across launches. */
function usePref<T>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(() => loadPref(key, fallback));
  useEffect(() => savePref(key, value), [key, value]);
  return [value, setValue] as const;
}

const comparators: Record<SortBy, (a: Note, b: Note) => number> = {
  edited: (a, b) => a.updatedAt - b.updatedAt,
  created: (a, b) => a.createdAt - b.createdAt,
  title: (a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }),
};

export default function App() {
  const folders = useLiveQuery(() => db.folders.orderBy('sortOrder').toArray(), []);
  // Newest edit first; sorting by updatedAt via the index.
  const allNotes = useLiveQuery(() => db.notes.orderBy('updatedAt').reverse().toArray(), []);

  const [folderId, setFolderId] = useState<string>(ALL_NOTES);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [renamingFolder, setRenamingFolder] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const [hideFolders, setHideFolders] = usePref('hideFolders', false);
  const [showNoteCount, setShowNoteCount] = usePref('showNoteCount', true);
  const [sortBy, setSortBy] = usePref<SortBy>('sortBy', 'edited');
  // For dates "desc" = newest first; for titles "desc" is shown as A→Z (the natural default).
  const [sortDir, setSortDir] = usePref<SortDir>('sortDir', 'desc');

  const inTrash = folderId === RECENTLY_DELETED;

  useEffect(() => { if (allNotes) noteSearch.sync(allNotes.filter(n => n.deletedAt === null)); }, [allNotes]);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const n of allNotes ?? []) {
      const key = n.deletedAt === null ? n.folderId : RECENTLY_DELETED;
      m.set(key, (m.get(key) ?? 0) + 1);
      if (n.deletedAt === null) m.set(ALL_NOTES, (m.get(ALL_NOTES) ?? 0) + 1);
    }
    return m;
  }, [allNotes]);

  const searching = query.trim().length > 0;

  const visible = useMemo(() => {
    const notes = allNotes ?? [];
    if (searching) {
      const byId = new Map(notes.map(n => [n.id, n]));
      return noteSearch.search(query).map(id => byId.get(id)!).filter(Boolean);
    }
    const filtered = inTrash
      ? notes.filter(n => n.deletedAt !== null)
      : notes.filter(n => n.deletedAt === null && (folderId === ALL_NOTES || n.folderId === folderId));
    const cmp = comparators[sortBy];
    // Titles read naturally A→Z when "desc" (the default) is chosen.
    const sign = (sortBy === 'title') === (sortDir === 'desc') ? 1 : -1;
    return [...filtered].sort((a, b) => sign * cmp(a, b));
    // NoteList splits out pinned notes.
  }, [allNotes, folderId, inTrash, query, searching, sortBy, sortDir]);

  // Keep a valid selection.
  useEffect(() => {
    if (!visible.some(n => n.id === selectedId)) setSelectedId(visible[0]?.id ?? null);
  }, [visible, selectedId]);

  const selected = visible.find(n => n.id === selectedId) ?? null;

  async function newNote() {
    const target = folderId === ALL_NOTES || inTrash ? DEFAULT_FOLDER_ID : folderId;
    setQuery('');
    if (inTrash) setFolderId(ALL_NOTES);
    setSelectedId(await createNote(target));
  }

  async function newFolder() {
    const id = await createFolder('New Folder');
    setHideFolders(false);
    setFolderId(id);
    setQuery('');
    setRenamingFolder(id);
  }

  function deleteSelected() {
    if (!selected) return;
    if (selected.deletedAt === null) trashNote(selected.id);
    else if (confirm('Delete permanently?')) purgeNote(selected.id);
  }

  async function exportMarkdown() {
    if (!selected || !desktop) return;
    await flushActiveEditor();
    const note = await db.notes.get(selected.id);
    if (note) await desktop.saveText(note.title || 'Untitled', 'md', toMarkdown(note.doc));
  }

  function focusSearch() {
    searchRef.current?.focus();
    searchRef.current?.select();
  }

  // Menu-bar commands (desktop app). A ref keeps the handler current without resubscribing.
  const handleCommand = useRef<(cmd: string, arg?: unknown) => void>(() => {});
  function onCommand(cmd: string, arg?: unknown) {
    if (runEditorCommand(cmd)) return;
    switch (cmd) {
      case 'new-note': return void newNote();
      case 'new-folder': return void newFolder();
      case 'focus-search': return focusSearch();
      case 'delete-note': return deleteSelected();
      case 'toggle-pin': return void (selected && togglePin(selected));
      case 'duplicate-note':
        if (selected) {
          flushActiveEditor()
            .then(() => db.notes.get(selected.id))
            .then(note => note && duplicateNote(note))
            .then(id => id && setSelectedId(id));
        }
        return;
      case 'export-markdown': return void exportMarkdown();
      case 'toggle-folders': return setHideFolders(v => !v);
      case 'toggle-note-count': return setShowNoteCount(v => !v);
      case 'set-sortBy': return setSortBy(arg as SortBy);
      case 'set-sortDir': return setSortDir(arg as SortDir);
    }
  }
  useLayoutEffect(() => { handleCommand.current = onCommand; });
  useEffect(() => desktop?.onCommand((cmd, arg) => handleCommand.current(cmd, arg)), []);

  // Tell the menu bar what's enabled/checked.
  useEffect(() => {
    desktop?.setState({
      hasNote: selected !== null,
      inTrash: selected?.deletedAt != null,
      pinned: selected?.pinned === 1,
      editable: selected !== null && selected.deletedAt === null,
      title: selected?.title ?? '',
      hideFolders, showNoteCount, sortBy, sortDir,
    });
  }, [selected, hideFolders, showNoteCount, sortBy, sortDir]);

  // Browser-only shortcuts; the desktop app uses its menu bar accelerators instead.
  useEffect(() => {
    if (isDesktop) return;
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); focusSearch(); }
      if (mod && e.altKey && e.code === 'KeyN') { e.preventDefault(); newNote(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!folders || !allNotes) return null;

  return (
    <div className={`app ${hideFolders ? 'no-folders' : ''}`}>
      {!hideFolders && (
        <FolderPane folders={folders} counts={counts} selected={folderId} showCount={showNoteCount}
          renaming={renamingFolder} onRename={setRenamingFolder} onNewFolder={newFolder}
          onSelect={id => { setFolderId(id); setQuery(''); }} />
      )}

      <section className="pane list">
        <header>
          <input ref={searchRef} type="search" placeholder={isDesktop ? 'Search' : 'Search all notes (⌘K)'} value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Escape' && setQuery('')} />
          <button className="icon-btn" title={isDesktop ? 'New Note (⌘N)' : 'New note (⌘⌥N)'} onClick={newNote}>✎</button>
        </header>
        {searching && <h4>{visible.length} result{visible.length === 1 ? '' : 's'}</h4>}
        <NoteList notes={visible} selectedId={selectedId} onSelect={setSelectedId} grouped={!searching && !inTrash} />
      </section>

      <main className="pane detail">
        {selected ? (
          <>
            <div className="detail-bar">
              <span className="muted">Edited {new Date(selected.updatedAt).toLocaleString()}</span>
              {selected.deletedAt === null ? (
                <button onClick={() => trashNote(selected.id)}>Delete</button>
              ) : (
                <>
                  <button onClick={() => restoreNote(selected.id)}>Restore</button>
                  <button className="danger" onClick={() => confirm('Delete permanently?') && purgeNote(selected.id)}>Delete forever</button>
                </>
              )}
            </div>
            <Editor key={selected.id} note={selected} readOnly={selected.deletedAt !== null} />
          </>
        ) : (
          <p className="empty">Select or create a note</p>
        )}
      </main>
    </div>
  );
}
