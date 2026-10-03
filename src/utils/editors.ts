import type { Editor } from '@tiptap/core';

// Runtime editor instances stay outside serializable project data.
const editors = new Map<string, Editor>();

export function registerEditor(id: string, editor: Editor) {
  editors.set(id, editor);
  return () => { if (editors.get(id) === editor) editors.delete(id); };
}

export function getEditor(id: string): Editor | undefined {
  return editors.get(id);
}

export function moveInlineCue(sourceId: string, sourcePosition: number, destinationId: string, destinationPosition: number): boolean {
  const source = editors.get(sourceId);
  const destination = editors.get(destinationId);
  if (!source || !destination || source.isDestroyed || destination.isDestroyed) return false;
  const sourceNode = source.state.doc.nodeAt(sourcePosition);
  if (!sourceNode || sourceNode.type.name !== 'inlineCue') return false;

  if (source === destination) {
    let transaction = source.state.tr.delete(sourcePosition, sourcePosition + sourceNode.nodeSize);
    let position = transaction.mapping.map(destinationPosition, destinationPosition <= sourcePosition ? -1 : 1);
    position = Math.max(0, Math.min(position, transaction.doc.content.size));
    transaction = transaction.insert(position, sourceNode);
    source.view.dispatch(transaction);
  } else {
    const position = Math.max(0, Math.min(destinationPosition, destination.state.doc.content.size));
    // Each Tiptap editor has its own ProseMirror schema instance. Recreate the
    // node with the destination schema before inserting it there.
    const destinationNode = destination.state.schema.nodeFromJSON(sourceNode.toJSON());
    const destinationTransaction = destination.state.tr.insert(position, destinationNode);
    source.view.dispatch(source.state.tr.delete(sourcePosition, sourcePosition + sourceNode.nodeSize));
    destination.view.dispatch(destinationTransaction);
    destination.view.focus();
  }
  return true;
}

export function moveInlineCueAt(sourceId: string, sourcePosition: number, clientX: number, clientY: number): boolean {
  const target = getInlineCueDropTarget(clientX, clientY);
  return target
    ? moveInlineCue(sourceId, sourcePosition, target.editorId, target.position)
    : false;
}

export interface InlineCueDropTarget {
  editorId: string;
  position: number;
  left: number;
  top: number;
  bottom: number;
}

export function getInlineCueDropTarget(clientX: number, clientY: number): InlineCueDropTarget | null {
  for (const [destinationId, editor] of editors) {
    const rect = editor.view.dom.getBoundingClientRect();
    if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) continue;
    const destination = editor.view.posAtCoords({ left: clientX, top: clientY });
    if (!destination) return null;
    const caret = editor.view.coordsAtPos(destination.pos);
    return {
      editorId: destinationId,
      position: destination.pos,
      left: caret.left,
      top: caret.top,
      bottom: caret.bottom,
    };
  }
  return null;
}

export function insertRhyme(id: string, word: string): boolean {
  const editor = editors.get(id);
  if (!editor || editor.isDestroyed) return false;
  let { from, to } = editor.state.selection;
  if (from !== to && editor.state.selection.$from.sameParent(editor.state.selection.$to)) {
    // Windows double-click selection can include the following space.
    const selected = editor.state.doc.textBetween(from, to);
    if (selected.trim()) {
      from += selected.length - selected.trimStart().length;
      to -= selected.length - selected.trimEnd().length;
    }
  }
  // A text node treats dictionary words literally, preserves undo and replaces the selection.
  return editor.chain().focus().insertContentAt({ from, to }, { type: 'text', text: word }).run();
}
