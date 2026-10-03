import { InputRule, Node, PasteRule } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import { Copy, X } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { getInlineCueDropTarget, moveInlineCueAt } from '../utils/editors';

interface CueDragState {
  pointerId: number;
  startX: number;
  startY: number;
  blockId: string;
  position: number;
  started: boolean;
}

function InlineCueView({ node, editor, getPos, extension, updateAttributes }: NodeViewProps) {
  const label = String(node.attrs.label ?? '');
  const dragState = useRef<CueDragState | null>(null);
  const dropCursor = useRef<HTMLDivElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editLabel, setEditLabel] = useState(label);
  const editInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (isEditing) {
      editInput.current?.focus();
      editInput.current?.select();
    }
  }, [isEditing]);
  useEffect(() => {
    const clearDropCursor = () => {
      dropCursor.current?.remove();
      dropCursor.current = null;
    };
    const updateDropCursor = (x: number, y: number) => {
      const target = getInlineCueDropTarget(x, y);
      if (!target) {
        clearDropCursor();
        return;
      }
      if (!dropCursor.current) {
        const cursor = document.createElement('div');
        cursor.className = 'lyricforge-cue-drop-cursor';
        Object.assign(cursor.style, {
          position: 'fixed',
          width: '2px',
          background: '#c084fc',
          borderRadius: '2px',
          boxShadow: '0 0 5px #c084fc',
          pointerEvents: 'none',
          zIndex: '2147483647',
        });
        document.body.appendChild(cursor);
        dropCursor.current = cursor;
      }
      Object.assign(dropCursor.current.style, {
        left: `${target.left}px`,
        top: `${target.top}px`,
        height: `${Math.max(12, target.bottom - target.top)}px`,
      });
    };
    const onPointerMove = (event: PointerEvent) => {
      const drag = dragState.current;
      if (!drag || event.pointerId !== drag.pointerId) return;
      if (!drag.started && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) >= 5) {
        drag.started = true;
        setIsDragging(true);
        document.body.style.cursor = 'grabbing';
      }
      if (drag.started) {
        event.preventDefault();
        updateDropCursor(event.clientX, event.clientY);
      }
    };
    const finishDrag = (event: PointerEvent) => {
      const drag = dragState.current;
      if (!drag || event.pointerId !== drag.pointerId) return;
      dragState.current = null;
      document.body.style.cursor = '';
      if (drag.started) {
        setIsDragging(false);
        clearDropCursor();
        moveInlineCueAt(drag.blockId, drag.position, event.clientX, event.clientY);
      }
    };
    const cancelDrag = (event: PointerEvent) => {
      if (dragState.current?.pointerId !== event.pointerId) return;
      dragState.current = null;
      document.body.style.cursor = '';
      setIsDragging(false);
      clearDropCursor();
    };
    document.addEventListener('pointermove', onPointerMove, true);
    document.addEventListener('pointerup', finishDrag, true);
    document.addEventListener('pointercancel', cancelDrag, true);
    return () => {
      document.removeEventListener('pointermove', onPointerMove, true);
      document.removeEventListener('pointerup', finishDrag, true);
      document.removeEventListener('pointercancel', cancelDrag, true);
      clearDropCursor();
      document.body.style.cursor = '';
    };
  }, []);

  const beginDrag = (event: ReactPointerEvent<HTMLSpanElement>) => {
    if (event.button !== 0) return;
    const position = typeof getPos === 'function' ? getPos() : null;
    if (typeof position !== 'number') return;
    event.preventDefault();
    dragState.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      blockId: extension.options.blockId,
      position,
      started: false,
    };
  };
  const insertAt = () => {
    const position = typeof getPos === 'function' ? getPos() : null;
    return typeof position === 'number' ? position + node.nodeSize : null;
  };
  const duplicate = () => {
    const position = insertAt();
    if (position !== null) editor.chain().focus().insertContentAt(position, {
      type: 'inlineCue', attrs: { label },
    }).run();
  };
  const commitEdit = () => {
    const nextLabel = editLabel.trim();
    if (nextLabel) updateAttributes({ label: nextLabel });
    setIsEditing(false);
  };
  const handleEditKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') { event.preventDefault(); commitEdit(); }
    if (event.key === 'Escape') { event.preventDefault(); setEditLabel(label); setIsEditing(false); }
  };

  return (
    <NodeViewWrapper
      as="span"
      contentEditable={false}
      draggable={false}
      data-inline-cue="true"
      className="group/cue relative inline-flex align-baseline items-center cursor-grab active:cursor-grabbing"
    >
      <span className={`inline-flex items-center rounded border border-violet-500/50 bg-violet-950/70 px-1.5 py-0.5 text-xs font-medium text-violet-200 ${isDragging ? 'opacity-60' : ''}`}>
        {isEditing ? (
          <input
            ref={editInput}
            aria-label={`Cue „${label}“ bearbeiten`}
            value={editLabel}
            maxLength={40}
            onChange={event => setEditLabel(event.target.value)}
            onKeyDown={handleEditKeyDown}
            onBlur={commitEdit}
            onPointerDown={event => event.stopPropagation()}
            className="min-w-12 max-w-48 bg-transparent text-xs text-violet-100 outline-none"
          />
        ) : (
          <span
            data-cue-label="true"
            draggable={false}
            onPointerDown={beginDrag}
            onDoubleClick={() => { setEditLabel(label); setIsEditing(true); }}
            title="Doppelklick zum Bearbeiten"
            className="touch-none select-none cursor-grab active:cursor-grabbing"
          >{label}</span>
        )}
      </span>
      <span aria-hidden="true" className="inline-block w-12 shrink-0" />
      <span className="absolute right-0 top-1/2 z-10 inline-flex -translate-y-1/2 items-center gap-0.5 rounded border border-[#444] bg-[#1e1e1e] p-0.5 opacity-0 transition-opacity group-hover/cue:opacity-100 focus-within:opacity-100">
        <button
          type="button"
          contentEditable={false}
          draggable={false}
          aria-label={`Cue „${label}“ duplizieren`}
          title="Cue duplizieren"
          onMouseDown={event => event.preventDefault()}
          onClick={duplicate}
          className="rounded p-0.5 text-violet-300 hover:bg-violet-800 hover:text-white"
        ><Copy size={12} /></button>
        <button
          type="button"
          contentEditable={false}
          draggable={false}
          aria-label={`Cue „${label}“ löschen`}
          title="Cue löschen"
          onMouseDown={event => event.preventDefault()}
          onClick={() => {
            const position = typeof getPos === 'function' ? getPos() : null;
            if (typeof position === 'number') editor.chain().focus().deleteRange({ from: position, to: position + node.nodeSize }).run();
          }}
          className="rounded p-0.5 text-violet-300 hover:bg-violet-800 hover:text-white"
        ><X size={12} /></button>
      </span>
    </NodeViewWrapper>
  );
}

export const InlineCue = Node.create({
  name: 'inlineCue',
  addOptions() {
    return { blockId: '' };
  },
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return { label: { default: '' } };
  },

  parseHTML() {
    return [{ tag: 'span[data-inline-cue]', getAttrs: element => ({
      label: (element as HTMLElement).getAttribute('data-label') ?? '',
    }) }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return ['span', { ...HTMLAttributes, 'data-inline-cue': 'true', 'data-label': node.attrs.label }, `[${node.attrs.label}]`];
  },

  renderText({ node }) {
    return `[${node.attrs.label}]`;
  },

  addNodeView() {
    return ReactNodeViewRenderer(InlineCueView);
  },

  addInputRules() {
    return [new InputRule({
      find: /\[([^\]\r\n]*\S[^\]\r\n]*)\]$/,
      handler: ({ range, match, commands }) => {
        const label = match[1].trim();
        if (!label) return;
        commands.insertContentAt(range, { type: this.name, attrs: { label } });
      },
    })];
  },

  addPasteRules() {
    return [new PasteRule({
      find: /\[([^\]\r\n]*\S[^\]\r\n]*)\]/g,
      handler: ({ range, match, commands }) => {
        commands.insertContentAt(range, { type: this.name, attrs: { label: match[1].trim() } });
      },
    })];
  },
});
