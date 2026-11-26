import { togglePin, type Note } from '../db';

interface Props {
  notes: Note[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  grouped: boolean; // false while searching (results are ranked by relevance)
}

const fmt = (t: number) => {
  const d = new Date(t);
  return d.toDateString() === new Date().toDateString()
    ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString();
};

export function NoteList({ notes, selectedId, onSelect, grouped }: Props) {
  const pinned = grouped ? notes.filter(n => n.pinned) : [];
  const rest = grouped ? notes.filter(n => !n.pinned) : notes;

  const item = (n: Note) => (
    <li key={n.id} className={n.id === selectedId ? 'selected' : ''} onClick={() => onSelect(n.id)}>
      <div className="title">{n.title || 'New Note'}</div>
      <div className="meta">
        <span className="date">{fmt(n.updatedAt)}</span>
        <span className="snippet">{n.snippet || 'No additional text'}</span>
      </div>
      {n.deletedAt === null && (
        <button className={`icon-btn pin ${n.pinned ? 'on' : ''}`} title={n.pinned ? 'Unpin' : 'Pin'}
          onClick={e => { e.stopPropagation(); togglePin(n); }}>
          {n.pinned ? '★' : '☆'}
        </button>
      )}
    </li>
  );

  if (notes.length === 0) return <p className="empty">No notes</p>;

  return (
    <>
      {pinned.length > 0 && (<><h4>Pinned</h4><ul>{pinned.map(item)}</ul></>)}
      {pinned.length > 0 && rest.length > 0 && <h4>Notes</h4>}
      <ul>{rest.map(item)}</ul>
    </>
  );
}
