import React, { useState, useEffect, useCallback } from 'react';
import { BlockData } from '../types';
import { useAppStore } from '../store';
import { GripVertical, Copy, Trash2 } from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { invoke } from '@tauri-apps/api/core';

// TipTap
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { RhymeHighlight } from '../tiptap/RhymeHighlight';

interface BlockProps {
  block: BlockData;
}

export const Block: React.FC<BlockProps> = ({ block }) => {
  const { updateBlock, duplicateBlock, removeBlock, project, setSidebarOpen, setActiveWord, setActiveBlockId, showHighlights } = useAppStore();
  const [syllables, setSyllables] = useState<number[]>([]);

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

  const calculateSyllables = useCallback(async (text: string) => {
    try {
      const lang = block.language === 'auto' ? project.settings.defaultLanguage : block.language;
      const result = await invoke<number[]>('calculate_syllables', {
        text: text,
        lang: lang
      });
      setSyllables(result);
    } catch (e) {
      console.error(e);
    }
  }, [block.language, project.settings.defaultLanguage]);

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
    ],
    content: block.content.split('\n').map(line => `<p>${line}</p>`).join(''),
    onUpdate: ({ editor }) => {
      // Get plain text for storing and syllables
      // We must explicitly join by single newline so that the lines map 1:1 with the syllable counter UI
      let text = '';
      editor.state.doc.descendants((node, pos) => {
        if (node.isText) {
          text += node.text;
        } else if (node.isBlock && pos > 0) {
          text += '\n';
        }
      });
      updateBlock(block.id, { content: text });
      calculateSyllables(text);
    },
    onSelectionUpdate: ({ editor }) => {
      const { from, to, empty } = editor.state.selection;
      if (!empty) {
        const selectedText = editor.state.doc.textBetween(from, to, ' ');
        const trimmed = selectedText.trim();
        if (trimmed && !trimmed.includes(' ')) { // Only single words
          setActiveWord(trimmed);
          setActiveBlockId(block.id);
          setSidebarOpen(true);
        }
      }
    }
  });

  // Initial calculation
  useEffect(() => {
    calculateSyllables(block.content);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        className="w-10 flex flex-col items-center justify-center border-r border-[#333] cursor-grab hover:bg-[#2a2a2a] text-gray-500 rounded-l-lg"
      >
        <GripVertical size={20} />
      </div>

      <div className="flex-1 flex flex-col">
        {/* Toolbar */}
        <div className="flex items-center justify-between p-2 border-b border-[#333] bg-[#222]">
          <div className="flex items-center space-x-2">
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

            <select
              value={block.language}
              onChange={(e) => updateBlock(block.id, { language: e.target.value as any })}
              className="bg-[#111] text-white border border-[#444] rounded px-2 py-1 text-sm"
            >
              <option value="auto">Auto</option>
              <option value="de">DE</option>
              <option value="en">EN</option>
            </select>
          </div>

          <div className="flex items-center space-x-2">
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
            className="flex-1 p-4 cursor-text prose-p:my-0 prose-p:leading-[1.5em] prose-p:text-[14px]"
            onDoubleClick={() => {
              if (editor) {
                const { from, to } = editor.state.selection;
                const text = editor.state.doc.textBetween(from, to, ' ').trim();
                if (text && !text.includes(' ')) {
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
          <div className="w-12 border-l border-[#333] flex flex-col items-center pt-4 text-xs font-mono text-gray-500 bg-[#1a1a1a] select-none">
            {block.content.split('\n').map((line, i) => {
              const count = syllables[i] || 0;
              return (
                <div key={i} className="h-[1.5em] text-[14px] flex items-center justify-center w-full" style={{ lineHeight: '1.5em' }}>
                  {line.trim() !== '' ? <span className="bg-[#2a2a2a] px-1 rounded hover:bg-gray-600 cursor-pointer" title="Silben">[{count}]</span> : ''}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
