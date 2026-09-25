import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { BlockData, ProjectData } from '../types';

interface AppState {
  project: ProjectData;
  setProject: (project: ProjectData) => void;
  updateBlock: (id: string, updates: Partial<BlockData>) => void;
  addBlock: (index?: number) => void;
  duplicateBlock: (id: string) => void;
  removeBlock: (id: string) => void;
  reorderBlocks: (activeId: string, overId: string) => void;

  // Sidebar states
  isSidebarOpen: boolean;
  setSidebarOpen: (isOpen: boolean) => void;
  activeWord: string | null;
  setActiveWord: (word: string | null) => void;
  activeBlockId: string | null;
  setActiveBlockId: (id: string | null) => void;

  // Toggle state
  highlightsEnabled: boolean;
  setHighlightsEnabled: (enabled: boolean) => void;
}

const defaultProject: ProjectData = {
  version: "1.0",
  metadata: {
    title: "Mein Neuer Track",
    artist: "Artist",
    tempoBpm: 120,
    created: new Date().toISOString(),
    modified: new Date().toISOString(),
  },
  settings: {
    defaultLanguage: "auto",
    highlightStrictness: "medium",
  },
  blocks: [
    {
      id: uuidv4(),
      type: "Verse",
      customTitle: "",
      language: "auto",
      content: "Ich laufe durch die kalte Nacht\nBis tief in mir ein Funke wacht",
    }
  ],
};

export const useAppStore = create<AppState>((set) => ({
  project: defaultProject,

  setProject: (project) => set({ project }),

  updateBlock: (id, updates) => set((state) => ({
    project: {
      ...state.project,
      blocks: state.project.blocks.map(block =>
        block.id === id ? { ...block, ...updates } : block
      ),
    }
  })),

  addBlock: (index) => set((state) => {
    const newBlock: BlockData = {
      id: uuidv4(),
      type: "Verse",
      customTitle: "",
      language: "auto",
      content: "",
    };

    const blocks = [...state.project.blocks];
    if (index !== undefined) {
      blocks.splice(index, 0, newBlock);
    } else {
      blocks.push(newBlock);
    }

    return { project: { ...state.project, blocks } };
  }),

  duplicateBlock: (id) => set((state) => {
    const index = state.project.blocks.findIndex(b => b.id === id);
    if (index === -1) return state;

    const blockToCopy = state.project.blocks[index];
    const newBlock: BlockData = {
      ...blockToCopy,
      id: uuidv4(),
    };

    const blocks = [...state.project.blocks];
    blocks.splice(index + 1, 0, newBlock);

    return { project: { ...state.project, blocks } };
  }),

  removeBlock: (id) => set((state) => {
    const block = state.project.blocks.find(b => b.id === id);
    if (block && block.content.trim() !== "") {
       const confirm = window.confirm("Bist du sicher, dass du diesen Block löschen willst?");
       if (!confirm) return state;
    }

    return {
      project: {
        ...state.project,
        blocks: state.project.blocks.filter(b => b.id !== id),
      }
    };
  }),

  reorderBlocks: (activeId, overId) => set((state) => {
    const blocks = [...state.project.blocks];
    const oldIndex = blocks.findIndex(b => b.id === activeId);
    const newIndex = blocks.findIndex(b => b.id === overId);

    if(oldIndex !== -1 && newIndex !== -1) {
      const [moved] = blocks.splice(oldIndex, 1);
      blocks.splice(newIndex, 0, moved);
    }

    return { project: { ...state.project, blocks } };
  }),

  isSidebarOpen: false,
  setSidebarOpen: (isOpen) => set({ isSidebarOpen: isOpen }),
  activeWord: null,
  setActiveWord: (word) => set({ activeWord: word }),
  activeBlockId: null,
  setActiveBlockId: (id) => set({ activeBlockId: id }),
  highlightsEnabled: true,
  setHighlightsEnabled: (enabled) => set({ highlightsEnabled: enabled }),
}));
