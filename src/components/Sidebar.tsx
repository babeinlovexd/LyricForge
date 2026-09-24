import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { X } from 'lucide-react';
import { useAppStore } from '../store';

interface RhymeResultGrouped {
  syllables: number;
  words: string[];
}

export const Sidebar: React.FC = () => {
  const { isSidebarOpen, setSidebarOpen, activeWord, activeBlockId, project, updateBlock } = useAppStore();
  const [activeTab, setActiveTab] = useState<'Rein' | 'Assonanz' | 'Vokalklang'>('Rein');
  const [results, setResults] = useState<RhymeResultGrouped[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (activeWord && isSidebarOpen) {
      fetchRhymes(activeWord, activeTab);
    }
  }, [activeWord, activeTab, isSidebarOpen]);

  const fetchRhymes = async (word: string, mode: string) => {
    setLoading(true);
    try {
      // Pass the language of the current active block or default
      let lang = project.settings.defaultLanguage;
      if (activeBlockId) {
        const block = project.blocks.find(b => b.id === activeBlockId);
        if (block && block.language !== 'auto') {
          lang = block.language;
        }
      }

      const response = await invoke<RhymeResultGrouped[]>('find_rhymes_for_word', {
        word,
        mode: mode.toLowerCase(),
        lang,
      });
      setResults(response);
    } catch (e) {
      console.error(e);
      setResults([]);
    }
    setLoading(false);
  };

  const handleWordClick = (word: string) => {
    if (activeBlockId) {
      const block = project.blocks.find(b => b.id === activeBlockId);
      if (block) {
        // Insert word at the end of the block content for now
        // A complete implementation would use ProseMirror commands to insert at cursor
        updateBlock(activeBlockId, { content: block.content + (block.content.endsWith(' ') ? '' : ' ') + word });
      }
    }
  };

  const handleWordRightClick = (e: React.MouseEvent, word: string) => {
    e.preventDefault();
    navigator.clipboard.writeText(word);
    // Optional: show a small toast "Copied!"
  };

  if (!isSidebarOpen) return null;

  return (
    <div className="w-80 border-l border-[#333] bg-[#1a1a1a] flex flex-col fixed right-0 top-0 h-screen z-50 shadow-[-5px_0_15px_rgba(0,0,0,0.5)]">
      <div className="p-4 border-b border-[#333] flex justify-between items-center bg-[#222]">
        <h2 className="font-bold text-white">Reim-Helfer</h2>
        <button onClick={() => setSidebarOpen(false)} className="text-gray-400 hover:text-white">
          <X size={20} />
        </button>
      </div>

      <div className="p-4 border-b border-[#333]">
        <p className="text-sm text-gray-400 mb-2">Aktuelles Wort:</p>
        <div className="bg-[#111] p-2 rounded text-center font-bold text-lg text-blue-400 border border-[#333]">
          {activeWord || "Kein Wort ausgewählt"}
        </div>
      </div>

      <div className="flex border-b border-[#333]">
        {(['Rein', 'Assonanz', 'Vokalklang'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2 text-sm text-center ${activeTab === tab ? 'bg-[#333] text-white font-bold' : 'text-gray-500 hover:bg-[#222]'}`}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="text-center text-gray-500 py-8">Suche Reime...</div>
        ) : results.length === 0 ? (
          <div className="text-center text-gray-500 py-8">Keine Ergebnisse gefunden.</div>
        ) : (
          results.map((group) => (
            <div key={group.syllables} className="mb-4">
              <h3 className="text-sm font-bold text-gray-400 mb-2 border-b border-[#333] pb-1 flex items-center">
                <span className="mr-2">▼</span> {group.syllables} {group.syllables === 1 ? 'Silbe' : 'Silben'}
              </h3>
              <div className="flex flex-wrap gap-2">
                {group.words.map((word, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleWordClick(word)}
                    onContextMenu={(e) => handleWordRightClick(e, word)}
                    className="bg-[#2a2a2a] hover:bg-[#3a3a3a] text-sm px-2 py-1 rounded text-gray-300 hover:text-white transition-colors border border-[#444]"
                    title="Klick: Einfügen, Rechtsklick: Kopieren"
                  >
                    {word}
                  </button>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
