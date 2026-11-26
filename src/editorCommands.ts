import { Extension, type Editor, type JSONContent } from '@tiptap/react';

/** The editor currently on screen, so menu commands can reach it. */
let active: Editor | null = null;
let flushActive: () => Promise<unknown> = async () => {};
export function setActiveEditor(e: Editor | null, flush?: () => Promise<unknown>) {
  active = e;
  flushActive = flush ?? (async () => {});
}

/** Saves the on-screen note's pending edits now (edits are otherwise saved after a short delay). */
export const flushActiveEditor = () => flushActive();

const chain = (e: Editor) => e.chain().focus();

/** Walks taskLists in a doc, letting `fn` rewrite each list's items. */
function mapTaskLists(doc: JSONContent, fn: (items: JSONContent[]) => JSONContent[]): JSONContent {
  const walk = (n: JSONContent): JSONContent => {
    const content = n.content?.map(walk);
    if (n.type === 'taskList' && content) return { ...n, content: fn(content) };
    return content ? { ...n, content } : n;
  };
  return walk(doc);
}

function rewrite(e: Editor, fn: (items: JSONContent[]) => JSONContent[]) {
  const next = mapTaskLists(e.getJSON(), fn);
  // A task list can't be empty; drop lists whose items were all removed.
  const prune = (n: JSONContent): JSONContent => ({
    ...n,
    ...(n.content && { content: n.content.filter(c => !(c.type === 'taskList' && !c.content?.length)).map(prune) }),
  });
  e.commands.setContent(prune(next), { emitUpdate: true });
  e.commands.focus();
}

const checked = (i: JSONContent) => i.attrs?.checked === true;
const setChecked = (v: boolean) => (items: JSONContent[]) => items.map(i => ({ ...i, attrs: { ...i.attrs, checked: v } }));

/** Implementations of the Format menu, keyed by command name. */
const commands: Record<string, (e: Editor) => unknown> = {
  'fmt-title': e => chain(e).setHeading({ level: 1 }).run(),
  'fmt-heading': e => chain(e).setHeading({ level: 2 }).run(),
  'fmt-subheading': e => chain(e).setHeading({ level: 3 }).run(),
  'fmt-body': e => chain(e).setParagraph().run(),
  'fmt-mono': e => chain(e).toggleCodeBlock().run(),
  'fmt-bullet': e => chain(e).toggleBulletList().run(),
  'fmt-numbered': e => chain(e).toggleOrderedList().run(),
  'fmt-quote': e => chain(e).toggleBlockquote().run(),
  'fmt-checklist': e => chain(e).toggleTaskList().run(),
  'fmt-bold': e => chain(e).toggleBold().run(),
  'fmt-italic': e => chain(e).toggleItalic().run(),
  'fmt-underline': e => chain(e).toggleUnderline().run(),
  'fmt-strike': e => chain(e).toggleStrike().run(),
  'indent': e => (e.isActive('taskItem') ? chain(e).sinkListItem('taskItem') : chain(e).sinkListItem('listItem')).run(),
  'outdent': e => (e.isActive('taskItem') ? chain(e).liftListItem('taskItem') : chain(e).liftListItem('listItem')).run(),
  'check-toggle': e => {
    if (!e.isActive('taskItem')) return chain(e).toggleTaskList().run();
    const cur = e.getAttributes('taskItem').checked === true;
    return chain(e).updateAttributes('taskItem', { checked: !cur }).run();
  },
  'check-all': e => rewrite(e, setChecked(true)),
  'uncheck-all': e => rewrite(e, setChecked(false)),
  'checked-to-bottom': e => rewrite(e, items => [...items.filter(i => !checked(i)), ...items.filter(checked)]),
  'delete-checked': e => rewrite(e, items => items.filter(i => !checked(i))),
};

/** Runs an editor command; returns false if the command isn't an editor command. */
export function runEditorCommand(cmd: string): boolean {
  const fn = commands[cmd];
  if (!fn) return false;
  if (active?.isEditable) fn(active);
  return true;
}

/**
 * Keyboard shortcuts matching macOS Notes. Higher priority than StarterKit so they
 * win over its defaults (e.g. Mod-Shift-7 is a numbered list there, a bulleted list here).
 */
export const NotesKeymap = Extension.create({
  name: 'notesKeymap',
  priority: 1000,
  addKeyboardShortcuts() {
    const run = (cmd: string) => () => { commands[cmd](this.editor); return true; };
    return {
      'Mod-Shift-t': run('fmt-title'),
      'Mod-Shift-h': run('fmt-heading'),
      'Mod-Shift-j': run('fmt-subheading'),
      'Mod-Shift-b': run('fmt-body'),
      'Mod-Shift-m': run('fmt-mono'),
      'Mod-Shift-7': run('fmt-bullet'),
      'Mod-Shift-9': run('fmt-numbered'),
      "Mod-'": run('fmt-quote'),
      'Mod-Shift-l': run('fmt-checklist'),
      'Mod-Shift-u': run('check-toggle'),
      'Mod-]': run('indent'),
      'Mod-[': run('outdent'),
    };
  },
});
