import React from 'react';
import { useAppStore } from '../store';
import { Block } from './Block';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';

export const BlockList: React.FC = () => {
  const { project, reorderBlocks, addBlock } = useAppStore();

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: any) => {
    const { active, over } = event;
    if (active && over && active.id !== over.id) {
      reorderBlocks(active.id, over.id);
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto p-4 pb-24">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={project.blocks.map(b => b.id)}
          strategy={verticalListSortingStrategy}
        >
          {project.blocks.map((block, index) => (
            <React.Fragment key={block.id}>
              <Block block={block} />

              {/* Insert Zone */}
              <div className="relative h-4 group flex items-center justify-center -my-2 z-20 hover:h-8 transition-all">
                <div className="w-full h-px bg-transparent group-hover:bg-[#444] transition-colors" />
                <button
                  onClick={() => addBlock(index + 1)}
                  className="absolute opacity-0 group-hover:opacity-100 bg-[#333] hover:bg-[#444] text-white text-xs px-2 py-1 rounded transition-opacity shadow-lg"
                >
                  + Block einfügen
                </button>
              </div>
            </React.Fragment>
          ))}
        </SortableContext>
      </DndContext>

      {project.blocks.length > 0 && (
        <div className="mt-8 flex justify-center">
          <button
            onClick={() => addBlock()}
            className="flex items-center gap-2 px-6 py-3 bg-[#1e1e1e] hover:bg-[#2a2a2a] text-gray-300 hover:text-white border border-[#333] hover:border-[#555] rounded-xl transition-all shadow-md group"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="group-hover:scale-110 transition-transform"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            Neuen Block am Ende hinzufügen
          </button>
        </div>
      )}

      {project.blocks.length === 0 && (
        <button
          onClick={() => addBlock()}
          className="w-full p-8 border-2 border-dashed border-[#444] text-gray-400 hover:text-white hover:border-[#666] hover:bg-[#1a1a1a] rounded-xl mt-4 transition-all flex flex-col items-center justify-center gap-2"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          Ersten Block hinzufügen
        </button>
      )}
    </div>
  );
};
