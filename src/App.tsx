import { BlockList } from "./components/BlockList";
import { Sidebar } from "./components/Sidebar";
import { useAppStore } from "./store";
import { openProject, saveProject, exportToMarkdown, exportToText } from "./utils/fileManager";

function App() {
  const { project, setProject, highlightsEnabled, setHighlightsEnabled } = useAppStore();

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
    <div className="min-h-screen bg-[#121212] text-white flex">
      <div className="flex-1 flex flex-col h-screen overflow-y-auto p-8">
        <header className="max-w-4xl mx-auto mb-10 flex flex-col md:flex-row justify-between items-start md:items-end w-full gap-4 pb-4 border-b border-[#2a2a2a]">
          <div className="flex items-center gap-4">
            <img src="/LF.png" alt="LyricForge Logo" className="w-16 h-16 object-contain drop-shadow-md" />
            <div>
              <h1 className="text-4xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-br from-gray-300 via-gray-400 to-green-500">
                LYRICFORGE
              </h1>
              <p className="text-gray-400 text-sm font-medium mt-1 uppercase tracking-widest">
                Modular Songwriting & Metrik-Analyse
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
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
              onClick={() => setHighlightsEnabled(!highlightsEnabled)}
              className={`flex items-center gap-2 border text-sm px-4 py-2 rounded-md font-medium transition-all shadow-sm ${highlightsEnabled ? 'bg-[#2a2a2a] border-[#444] text-green-400' : 'bg-[#1a1a1a] border-[#333] text-gray-500'}`}
              title="Highlights (Farben) ein-/ausschalten"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12h4l3-9 5 18 3-9h5"/></svg>
              Highlights
            </button>
            <div className="h-9 w-px bg-[#333] mx-1"></div>
            <button onClick={handleExportMd} className="bg-[#1a1a1a] hover:bg-[#2a2a2a] border border-[#3a3a3a] text-sm px-3 py-2 rounded-md font-medium transition-all shadow-sm">.md</button>
            <button onClick={handleExportTxt} className="bg-[#1a1a1a] hover:bg-[#2a2a2a] border border-[#3a3a3a] text-sm px-3 py-2 rounded-md font-medium transition-all shadow-sm">.txt</button>
          </div>
        </header>

        <main className="flex-1 w-full max-w-4xl mx-auto">
          <BlockList />
        </main>
      </div>

      <Sidebar />
    </div>
  );
}

export default App;
