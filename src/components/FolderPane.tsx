import { ALL_NOTES, DEFAULT_FOLDER_ID, RECENTLY_DELETED, deleteFolder, renameFolder, type Folder } from '../db';

interface Props {
  folders: Folder[];
  counts: Map<string, number>;
  selected: string;
  showCount: boolean;
  /** Folder whose name is being edited, if any. */
  renaming: string | null;
  onRename: (id: string | null) => void;
  onNewFolder: () => void;
  onSelect: (id: string) => void;
}

export function FolderPane({ folders, counts, selected, showCount, renaming, onRename, onNewFolder, onSelect }: Props) {
  const row = (id: string, name: string, extra?: React.ReactNode) => (
    <li key={id} className={selected === id ? 'selected' : ''} onClick={() => onSelect(id)}
      onDoubleClick={() => id !== ALL_NOTES && id !== RECENTLY_DELETED && onRename(id)}>
      {renaming === id ? (
        <input autoFocus defaultValue={name} onFocus={e => e.currentTarget.select()}
          onBlur={e => { renameFolder(id, e.target.value.trim() || name); onRename(null); }}
          onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') onRename(null); }} />
      ) : (
        <span className="name">{name}</span>
      )}
      {showCount && <span className="count">{counts.get(id) ?? 0}</span>}
      {extra}
    </li>
  );

  return (
    <aside className="pane folders">
      <ul>
        {row(ALL_NOTES, 'All Notes')}
        {folders.map(f => row(f.id, f.name, f.id !== DEFAULT_FOLDER_ID && (
          <button className="icon-btn del" title="Delete folder"
            onClick={e => { e.stopPropagation(); if (confirm(`Delete “${f.name}”? Its notes move to Recently Deleted.`)) { deleteFolder(f.id); onSelect(ALL_NOTES); } }}>×</button>
        )))}
        {row(RECENTLY_DELETED, 'Recently Deleted')}
      </ul>
      <button className="new-folder" onClick={onNewFolder}>+ New Folder</button>
    </aside>
  );
}
