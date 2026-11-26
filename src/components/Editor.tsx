import { useEffect, useRef } from 'react';
import { useEditor, EditorContent, type Editor as TEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Placeholder from '@tiptap/extension-placeholder';
import { saveNoteDoc, type Note } from '../db';
import { NotesKeymap, setActiveEditor } from '../editorCommands';

const SAVE_DELAY_MS = 400;

export function Editor({ note, readOnly }: { note: Note; readOnly: boolean }) {
  const timer = useRef<number | undefined>(undefined);
  const pending = useRef<(() => Promise<unknown>) | null>(null);

  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
        TaskList,
        TaskItem.configure({ nested: true }),
        NotesKeymap,
        Placeholder.configure({ placeholder: ({ node }) => (node.type.name === 'heading' ? 'Title' : 'Start writing…') }),
      ],
      content: note.doc,
      editable: !readOnly,
      autofocus: note.title === '' ? 'start' : false,
      onUpdate: ({ editor }) => {
        const id = note.id;
        pending.current = () => saveNoteDoc(id, editor.getJSON());
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(flush, SAVE_DELAY_MS);
      },
    },
    // Recreate the editor when switching notes so undo history doesn't leak across notes.
    [note.id],
  );

  function flush(): Promise<unknown> {
    window.clearTimeout(timer.current);
    const save = pending.current;
    pending.current = null;
    return save ? save() : Promise.resolve();
  }

  // Save immediately when switching away or closing the tab.
  useEffect(() => {
    window.addEventListener('beforeunload', flush);
    return () => {
      window.removeEventListener('beforeunload', flush);
      flush();
    };
  }, [note.id]);

  // Let menu-bar commands reach this editor.
  useEffect(() => {
    setActiveEditor(editor, flush);
    return () => setActiveEditor(null);
  }, [editor]);

  useEffect(() => {
    editor?.setEditable(!readOnly);
  }, [editor, readOnly]);

  return (
    <div className="editor">
      {!readOnly && <Toolbar editor={editor} />}
      <EditorContent editor={editor} className="editor-content" />
    </div>
  );
}

function Toolbar({ editor }: { editor: TEditor | null }) {
  if (!editor) return null;
  const btn = (label: string, title: string, active: boolean, run: () => void) => (
    <button type="button" title={title} className={active ? 'active' : ''} onMouseDown={e => { e.preventDefault(); run(); }}>
      {label}
    </button>
  );
  const c = () => editor.chain().focus();
  return (
    <div className="toolbar">
      {btn('H1', 'Title', editor.isActive('heading', { level: 1 }), () => c().toggleHeading({ level: 1 }).run())}
      {btn('H2', 'Heading', editor.isActive('heading', { level: 2 }), () => c().toggleHeading({ level: 2 }).run())}
      {btn('H3', 'Subheading', editor.isActive('heading', { level: 3 }), () => c().toggleHeading({ level: 3 }).run())}
      <span className="sep" />
      {btn('B', 'Bold', editor.isActive('bold'), () => c().toggleBold().run())}
      {btn('I', 'Italic', editor.isActive('italic'), () => c().toggleItalic().run())}
      {btn('U', 'Underline', editor.isActive('underline'), () => c().toggleUnderline().run())}
      {btn('S', 'Strikethrough', editor.isActive('strike'), () => c().toggleStrike().run())}
      <span className="sep" />
      {btn('•', 'Bulleted list', editor.isActive('bulletList'), () => c().toggleBulletList().run())}
      {btn('1.', 'Numbered list', editor.isActive('orderedList'), () => c().toggleOrderedList().run())}
      {btn('☐', 'Checklist', editor.isActive('taskList'), () => c().toggleTaskList().run())}
    </div>
  );
}
