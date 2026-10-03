import React, { useState, useEffect, useRef, KeyboardEvent } from 'react';
import { BlockData } from '../types';
import { useAppStore } from '../store';
import { GripVertical, Copy, Trash2, X } from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { invoke } from '@tauri-apps/api/core';

// TipTap
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { RhymeHighlight } from '../tiptap/RhymeHighlight';
import { InlineCue } from '../tiptap/InlineCue';
import { editorText, lyricTextFromContent, parseEditorContent } from '../utils/editorText';
import { registerEditor } from '../utils/editors';

interface BlockProps {
  block: BlockData;
}

export const Block: React.FC<BlockProps> = ({ block }) => {
  const { updateBlock, duplicateBlock, removeBlock, setSidebarOpen, setActiveWord, setActiveBlockId, showHighlights } = useAppStore();
  const [syllables, setSyllables] = useState<{ min: number; max: number; estimated: boolean }[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [editingTagIndex, setEditingTagIndex] = useState<number | null>(null);
  const [editingTagValue, setEditingTagValue] = useState('');
  const editingTagInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingTagIndex !== null) {
      editingTagInput.current?.focus();
      editingTagInput.current?.select();
    }
  }, [editingTagIndex]);

  const commitTagEdit = () => {
    if (editingTagIndex === null) return;
    const tags = block.tags ?? [];
    const next = editingTagValue.trim().replace(/\|/g, '').trim();
    const current = tags[editingTagIndex];
    if (next && next.length <= 40 && !tags.some((tag, index) => index !== editingTagIndex && tag.toLocaleLowerCase() === next.toLocaleLowerCase())) {
      const updated = [...tags];
      updated[editingTagIndex] = next;
      updateBlock(block.id, { tags: updated });
    }
    setEditingTagIndex(null);
    setEditingTagValue(current ?? '');
  };

  const handleTagEditKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') { event.preventDefault(); commitTagEdit(); }
    if (event.key === 'Escape') {
      event.preventDefault();
      setEditingTagValue(block.tags?.[editingTagIndex ?? -1] ?? '');
      setEditingTagIndex(null);
    }
  };

  const addTag = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const tag = tagInput.trim().replace(/\|/g, '').trim();
    const tags = block.tags ?? [];
    if (!tag || tag.length > 40 || tags.length >= 10 || tags.some(existing => existing.toLocaleLowerCase() === tag.toLocaleLowerCase())) return;
    updateBlock(block.id, { tags: [...tags, tag] });
    setTagInput('');
  };

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: block.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : 1,
    opacity: isDragging ? 0.8 : 1,
  };

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Turn off features we don't need
        heading: false,
        bulletList: false,
        orderedList: false,
        blockquote: false,
        codeBlock: false,
      }),
      RhymeHighlight,
      InlineCue.configure({ blockId: block.id }),
    ],
    editorProps: {
      attributes: {
        spellcheck: 'false',
      },
    },
    content: parseEditorContent(block.content),
    onUpdate: ({ editor }) => {
      // Get plain text for storing and syllables
      // We must explicitly join by single newline so that the lines map 1:1 with the syllable counter UI
      const { text } = editorText(editor.state.doc);
      updateBlock(block.id, { content: text });
    },
    onFocus: () => setActiveBlockId(block.id),
    onSelectionUpdate: ({ editor }) => {
      setActiveBlockId(block.id);
      const { from, to, empty } = editor.state.selection;
      if (!empty) {
        const selectedText = editor.state.doc.textBetween(from, to, ' ');
        const trimmed = selectedText.trim();
        if (trimmed && !/\s/u.test(trimmed)) {
          setActiveWord(trimmed);
          setActiveBlockId(block.id);
          setSidebarOpen(true);
        }
      }
    }
  });

  useEffect(() => {
    if (editor) return registerEditor(block.id, editor);
  }, [block.id, editor]);

  useEffect(() => {
    let cancelled = false;
    invoke<{ min: number; max: number; estimated: boolean }[]>('calculate_syllables', { text: lyricTextFromContent(block.content), lang: 'auto' })
      .then(result => { if (!cancelled) setSyllables(result); })
      .catch(console.error);
    return () => { cancelled = true; };
  }, [block.content]);

  useEffect(() => {
    if (editor) editor.view.dispatch(editor.state.tr.setMeta('rhymeLanguage', 'auto'));
  }, [editor]);

  useEffect(() => {
    if (editor && editorText(editor.state.doc).text !== block.content) {
      editor.commands.setContent(parseEditorContent(block.content), { emitUpdate: false });
    }
  }, [editor, block.content]);

  // Sync highlights toggle state to ProseMirror
  useEffect(() => {
    if (editor) {
      editor.view.dispatch(editor.view.state.tr.setMeta('showHighlights', showHighlights));
    }
  }, [showHighlights, editor]);

  return (
    <div ref={setNodeRef} style={style} className="bg-[#1e1e1e] border border-[#333] rounded-lg mb-4 flex relative group/block">
      {/* Drag Handle */}
      <div
        {...attributes}
        {...listeners}
        className="w-10 shrink-0 flex flex-col items-center justify-center border-r border-[#333] cursor-grab hover:bg-[#2a2a2a] text-gray-500 rounded-l-lg"
      >
        <GripVertical size={20} />
      </div>

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Toolbar */}
        <div className="flex items-center justify-between p-2 border-b border-[#333] bg-[#222]">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <select
              value={block.type}
              onChange={(e) => updateBlock(block.id, { type: e.target.value as any })}
              className="bg-[#111] text-white border border-[#444] rounded px-2 py-1 text-sm"
            >
              <option value="Intro">Intro</option>
              <option value="Verse">Verse</option>
              <option value="Pre-Chorus">Pre-Chorus</option>
              <option value="Chorus">Chorus</option>
              <option value="Bridge">Bridge</option>
              <option value="Outro">Outro</option>
              <option value="Scene">Scene</option>
              <option value="Skit">Skit</option>
              <option value="Interlude">Interlude</option>
              <option value="Custom">Custom</option>
            </select>

            {block.type === 'Custom' && (
              <input
                type="text"
                placeholder="Custom title..."
                value={block.customTitle}
                onChange={(e) => updateBlock(block.id, { customTitle: e.target.value })}
                className="bg-[#111] text-white border border-[#444] rounded px-2 py-1 text-sm w-32"
              />
            )}

            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              {(block.tags ?? []).map((tag, index) => (
                <span key={`${tag}-${index}`} className="inline-flex items-center gap-1 rounded border border-[#3c5742] bg-[#1d2b21] px-2 py-1 text-xs text-green-200">
                  {editingTagIndex === index ? (
                    <input
                      ref={editingTagInput}
                      aria-label={`Block-Tag bearbeiten: ${tag}`}
                      value={editingTagValue}
                      maxLength={40}
                      onChange={event => setEditingTagValue(event.target.value)}
                      onKeyDown={handleTagEditKeyDown}
                      onBlur={commitTagEdit}
                      onDoubleClick={event => event.stopPropagation()}
                      className="w-24 bg-transparent text-xs text-green-100 outline-none"
                    />
                  ) : (
                    <span title="Doppelklick zum Bearbeiten" onDoubleClick={() => { setEditingTagValue(tag); setEditingTagIndex(index); }}>{tag}</span>
                  )}
                  <button
                    type="button"
                    aria-label={`Tag „${tag}“ entfernen`}
                    title={`Tag „${tag}“ entfernen`}
                    onClick={() => updateBlock(block.id, { tags: (block.tags ?? []).filter((_, tagIndex) => tagIndex !== index) })}
                    className="rounded text-green-300 hover:bg-[#354a3a] hover:text-white"
                  ><X size={12} /></button>
                </span>
              ))}
              {(block.tags ?? []).length < 10 && (
                <input
                  type="text"
                  aria-label="Block-Tag hinzufügen"
                  placeholder="+ Tag"
                  value={tagInput}
                  maxLength={40}
                  onChange={event => setTagInput(event.target.value)}
                  onKeyDown={addTag}
                  className="w-20 rounded border border-[#3a3a3a] bg-[#111] px-2 py-1 text-xs text-white placeholder:text-gray-500 focus:border-green-600 focus:outline-none"
                />
              )}
            </div>
          </div>

          <div className="ml-2 flex shrink-0 items-center space-x-2">
            <button onClick={() => duplicateBlock(block.id)} className="p-1 hover:bg-[#333] rounded text-gray-400 hover:text-white" title="Duplizieren">
              <Copy size={16} />
            </button>
            <button onClick={() => removeBlock(block.id)} className="p-1 hover:bg-[#4a1c1c] rounded text-red-500 hover:text-red-400" title="Löschen">
              <Trash2 size={16} />
            </button>
          </div>
        </div>

        {/* Editor Area & Syllables */}
        <div className="flex relative">
          <div
            className="flex-1 min-w-0 p-4 cursor-text prose-p:my-0 prose-p:leading-[1.5em] prose-p:text-[14px]"
            onDoubleClick={() => {
              if (editor) {
                const { from, to } = editor.state.selection;
                const text = editor.state.doc.textBetween(from, to, ' ').trim();
                if (text && !/\s/u.test(text)) {
                  setActiveWord(text);
                  setActiveBlockId(block.id);
                  setSidebarOpen(true);
                }
              }
            }}
          >
            <EditorContent editor={editor} />
          </div>

          {/* Syllables Column */}
          <div className="w-12 shrink-0 border-l border-[#333] flex flex-col items-center pt-4 text-xs font-mono text-gray-500 bg-[#1a1a1a] select-none">
            {lyricTextFromContent(block.content).split('\n').map((line, i) => {
              const value = syllables[i];
              const count = value ? (value.min === value.max ? String(value.min) : `${value.min}–${value.max}`) : '…';
              return (
                <div key={i} className="h-[1.5em] text-[14px] flex items-center justify-center w-full" style={{ lineHeight: '1.5em' }}>
                  {line.trim() !== '' ? <span className="bg-[#2a2a2a] px-1 rounded hover:bg-gray-600 cursor-pointer" title={value && value.min !== value.max ? "Mehrdeutige Aussprache: mögliche Silbenzahl" : value?.estimated ? "Silbenzahl aus Kontext oder Näherung" : "Silben"}>[{count}]</span> : ''}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
