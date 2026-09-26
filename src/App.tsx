import { BlockList } from "./components/BlockList";
import { Sidebar } from "./components/Sidebar";
import { useAppStore } from "./store";
import { useState } from "react";
import { openProject, saveProject, exportToMarkdown, exportToText } from "./utils/fileManager";
import { Eye, EyeOff, Download, ChevronDown } from "lucide-react";

function App() {
  const { project, setProject, setMetadata, showHighlights, toggleHighlights } = useAppStore();
  const [exportOpen, setExportOpen] = useState(false);

  const handleOpen = async () => {
    const loaded = await openProject();
    if (loaded) {
      setProject(loaded);
    }
  };

  const handleSave = async () => {
    await saveProject(project);
  };

  const handleExportMd = async () => {
    await exportToMarkdown(project);
  };

  const handleExportTxt = async () => {
    await exportToText(project);
  };

  return (
    <div className="h-screen w-screen bg-[#121212] text-white flex flex-col overflow-hidden">
      <header className="shrink-0 w-full p-4 border-b border-[#2a2a2a] bg-[#1a1a1a] flex justify-between items-center">
        <div className="flex items-center gap-4 pl-4">
          <img src="/LF.png" alt="LyricForge Logo" className="h-16 w-auto object-contain drop-shadow-md" />
          <div>
            <h1 className="text-4xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-br from-gray-300 via-gray-400 to-green-500">
              LYRICFORGE
            </h1>
            <p className="text-gray-400 text-sm font-medium mt-1 uppercase tracking-widest">
              Modular Songwriting & Metrik-Analyse
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 pr-4">
            <button onClick={handleOpen} className="flex items-center gap-2 bg-[#1a1a1a] hover:bg-[#2a2a2a] border border-[#3a3a3a] text-sm px-4 py-2 rounded-md font-medium transition-all shadow-sm">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>
              Öffnen
            </button>
            <button onClick={handleSave} className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-sm px-4 py-2 rounded-md font-medium transition-all shadow-sm">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
              Speichern
            </button>
            <div className="h-9 w-px bg-[#333] mx-1"></div>
            <button
              onClick={toggleHighlights}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm transition-colors ${showHighlights ? 'bg-emerald-950/40 border-emerald-600 text-emerald-400' : 'bg-zinc-800/40 border-zinc-700 text-zinc-500'}`}
              title="Highlights (Farben) ein-/ausschalten"
            >
              {showHighlights ? <Eye size={16} /> : <EyeOff size={16} />}
              <span>Highlights {showHighlights ? 'An' : 'Aus'}</span>
            </button>
            <div className="h-9 w-px bg-[#333] mx-1"></div>

            <div className="relative">
              <button
                onClick={() => setExportOpen(!exportOpen)}
                className="flex items-center gap-2 bg-[#1a1a1a] hover:bg-[#2a2a2a] border border-[#3a3a3a] text-sm px-4 py-2 rounded-md font-medium transition-all shadow-sm"
              >
                <Download size={16} />
                Export
                <ChevronDown size={16} className={`transition-transform ${exportOpen ? 'rotate-180' : ''}`} />
              </button>

              {exportOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setExportOpen(false)}></div>
                  <div className="absolute right-0 mt-2 w-32 bg-[#1e1e1e] border border-[#333] rounded-md shadow-xl z-20 flex flex-col overflow-hidden">
                    <button
                      onClick={() => { handleExportTxt(); setExportOpen(false); }}
                      className="text-left px-4 py-2 text-sm hover:bg-[#2a2a2a] border-b border-[#333] transition-colors"
                    >
                      Als .txt
                    </button>
                    <button
                      onClick={() => { handleExportMd(); setExportOpen(false); }}
                      className="text-left px-4 py-2 text-sm hover:bg-[#2a2a2a] transition-colors"
                    >
                      Als Markdown
                    </button>
                  </div>
                </>
              )}
            </div>

        </div>
      </header>

      <div className="flex-1 flex flex-row overflow-hidden min-h-0">
        <main className="flex-1 overflow-y-auto p-4 min-h-0 w-full max-w-4xl mx-auto">
          <div className="mb-6 flex gap-4">
            <input
              type="text"
              placeholder="Song Titel"
              value={project.metadata.title}
              onChange={(e) => setMetadata({ title: e.target.value })}
              className="bg-transparent text-2xl font-bold border-b border-[#444] focus:border-green-500 outline-none pb-1 flex-1 placeholder-gray-600 transition-colors"
            />
            <input
              type="text"
              placeholder="Künstler / Autor"
              value={project.metadata.artist}
              onChange={(e) => setMetadata({ artist: e.target.value })}
              className="bg-transparent text-xl font-medium text-gray-400 border-b border-[#444] focus:border-green-500 outline-none pb-1 w-1/3 placeholder-gray-600 transition-colors"
            />
          </div>
          <BlockList />
        </main>
      </div>

      <Sidebar />
    </div>
  );
}

export default App;
