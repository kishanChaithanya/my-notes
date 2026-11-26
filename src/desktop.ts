/** Bridge exposed by electron/preload.cjs. Undefined when running in a normal browser. */
export interface UiState {
  hasNote: boolean;
  inTrash: boolean;
  pinned: boolean;
  editable: boolean;
  title: string;
  hideFolders: boolean;
  showNoteCount: boolean;
  sortBy: SortBy;
  sortDir: SortDir;
}

export type SortBy = 'edited' | 'created' | 'title';
export type SortDir = 'asc' | 'desc';

interface NotesDesktop {
  platform: string;
  onCommand(cb: (cmd: string, arg?: unknown) => void): () => void;
  setState(state: Partial<UiState>): void;
  saveText(name: string, ext: string, text: string): Promise<boolean>;
}

declare global {
  interface Window { notesDesktop?: NotesDesktop }
}

export const desktop = window.notesDesktop;
export const isDesktop = desktop !== undefined;

if (isDesktop) document.documentElement.classList.add('desktop');

/** Per-viewer view preferences; storage may be unavailable, so always fall back. */
export function loadPref<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(`pref:${key}`);
    return v === null ? fallback : (JSON.parse(v) as T);
  } catch {
    return fallback;
  }
}

export function savePref(key: string, value: unknown) {
  try {
    localStorage.setItem(`pref:${key}`, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}
