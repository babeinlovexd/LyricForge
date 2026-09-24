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
                  className="absolute opacity-0 group-hover:opacity-100 bg-[#333] hover:bg-[#444] text-white text-xs px-2 py-1 rounded transition-opacity"
                >
                  + Block einfügen
                </button>
              </div>
            </React.Fragment>
          ))}
        </SortableContext>
      </DndContext>

      {project.blocks.length === 0 && (
        <button
          onClick={() => addBlock()}
          className="w-full p-4 border border-dashed border-[#444] text-gray-400 hover:text-white hover:border-[#666] rounded-lg mt-4"
        >
          + Ersten Block hinzufügen
        </button>
      )}
    </div>
  );
};
