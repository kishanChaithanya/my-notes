import type { JSONContent } from '@tiptap/react';

/** Converts a TipTap document to Markdown (headings, lists, checklists, quotes, code, inline marks). */
export function toMarkdown(doc: JSONContent): string {
  return blocks(doc.content ?? [], '').join('\n\n').trim() + '\n';
}

function inline(nodes: JSONContent[] = []): string {
  return nodes.map(n => {
    if (n.type === 'hardBreak') return '  \n';
    let t = n.text ?? '';
    for (const m of n.marks ?? []) {
      if (m.type === 'code') t = '`' + t + '`';
      else if (m.type === 'bold') t = `**${t}**`;
      else if (m.type === 'italic') t = `*${t}*`;
      else if (m.type === 'strike') t = `~~${t}~~`;
      else if (m.type === 'link') t = `[${t}](${m.attrs?.href ?? ''})`;
    }
    return t;
  }).join('');
}

function blocks(nodes: JSONContent[], indent: string): string[] {
  return nodes.map(n => block(n, indent));
}

/** `width` is the content column; for "- [ ] " items it is 2, since the checkbox is part of the content. */
function listItems(n: JSONContent, indent: string, marker: (i: number, item: JSONContent) => string, width?: number): string {
  return (n.content ?? []).map((item, i) => {
    const prefix = marker(i, item);
    const [first, ...rest] = item.content ?? [];
    const head = indent + prefix + (first ? block(first, '') : '');
    const tail = rest.map(c => block(c, indent + ' '.repeat(width ?? prefix.length)));
    return [head, ...tail].join('\n');
  }).join('\n');
}

function block(n: JSONContent, indent: string): string {
  switch (n.type) {
    case 'heading': return indent + '#'.repeat(n.attrs?.level ?? 1) + ' ' + inline(n.content);
    case 'paragraph': return indent + inline(n.content);
    case 'codeBlock': return indent + '```\n' + inline(n.content) + '\n' + indent + '```';
    case 'blockquote': return blocks(n.content ?? [], '').join('\n\n').split('\n').map(l => indent + '> ' + l).join('\n');
    case 'horizontalRule': return indent + '---';
    case 'bulletList': return listItems(n, indent, () => '- ');
    case 'orderedList': return listItems(n, indent, i => `${(n.attrs?.start ?? 1) + i}. `);
    case 'taskList': return listItems(n, indent, (_i, item) => (item.attrs?.checked ? '- [x] ' : '- [ ] '), 2);
    default: return indent + inline(n.content);
  }
}
