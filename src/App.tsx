import { BlockList } from "./components/BlockList";
import { Sidebar } from "./components/Sidebar";
import { useAppStore } from "./store";
import { openProject, saveProject, exportToMarkdown, exportToText } from "./utils/fileManager";

function App() {
  const { project, setProject } = useAppStore();

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
        <header className="max-w-4xl mx-auto mb-8 flex justify-between items-end w-full">
          <div>
            <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-500">
              LyricForge
            </h1>
            <p className="text-gray-400 text-sm mt-1">Modular Songwriting & Metrik-Analyse</p>
          </div>

          <div className="flex space-x-2">
            <button onClick={handleOpen} className="bg-[#222] hover:bg-[#333] border border-[#444] text-sm px-3 py-1 rounded transition-colors">Öffnen</button>
            <button onClick={handleSave} className="bg-[#222] hover:bg-[#333] border border-[#444] text-sm px-3 py-1 rounded transition-colors">Speichern</button>
            <button onClick={handleExportMd} className="bg-[#222] hover:bg-[#333] border border-[#444] text-sm px-3 py-1 rounded transition-colors">Export .md</button>
            <button onClick={handleExportTxt} className="bg-[#222] hover:bg-[#333] border border-[#444] text-sm px-3 py-1 rounded transition-colors">Export .txt</button>
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
