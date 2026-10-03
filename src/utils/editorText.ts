import type { Node } from '@tiptap/pm/model';

// Use the same plain text for saving, syllables and rhyme offsets.
// Each position represents one UTF-16 code unit, as used by JavaScript and Rust IPC.
export function editorText(doc: Node, includeCues = true): { text: string; positions: number[] } {
  let text = '';
  const positions: number[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name === 'inlineCue') {
      if (includeCues) {
        const value = `[${String(node.attrs.label ?? '')}]`;
        text += value;
        for (let i = 0; i < value.length; i++) positions.push(pos);
      }
      return false;
    }
    if (node.isText) {
      const value = node.text ?? '';
      for (let i = 0; i < value.length; i++) positions.push(pos + i);
      text += value;
    } else if (node.type.name === 'hardBreak' || (node.isBlock && pos > 0)) {
      text += '\n';
      positions.push(pos);
    }
  });
  return { text, positions };
}

export function parseEditorContent(content: string) {
  const parseLine = (line: string) => {
    const nodes: { type: string; text?: string; attrs?: { label: string } }[] = [];
    const cuePattern = /\[([^\]\r\n]*\S[^\]\r\n]*)\]/g;
    let cursor = 0;
    for (const match of line.matchAll(cuePattern)) {
      const index = match.index ?? 0;
      if (index > cursor) nodes.push({ type: 'text', text: line.slice(cursor, index) });
      nodes.push({ type: 'inlineCue', attrs: { label: match[1].trim() } });
      cursor = index + match[0].length;
    }
    if (cursor < line.length) nodes.push({ type: 'text', text: line.slice(cursor) });
    return { type: 'paragraph', content: nodes };
  };
  return { type: 'doc', content: content.split('\n').map(parseLine) };
}

export function lyricTextFromContent(content: string): string {
  return content.replace(/\[([^\]\r\n]*\S[^\]\r\n]*)\]/g, '');
}
