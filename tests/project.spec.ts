import { test, expect } from '@playwright/test';
import { parseProject, blockTitles } from '../src/utils/project';
import { useAppStore } from '../src/store';

const fresh = () => structuredClone(useAppStore.getState().project);
test('project validation rejects corrupt and unsupported files', () => {
  const p = fresh();
  expect(parseProject(p)).toEqual(p);
  for (const value of [null, {}, { ...p, version: '99' }, { ...p, blocks: [p.blocks[0], p.blocks[0]] },
    { ...p, metadata: { ...p.metadata, tempoBpm: -1 } }, { ...p, blocks: [{ ...p.blocks[0], language: 'fr' }] }]) {
    expect(() => parseProject(value)).toThrow();
  }
});
test('legacy projects migrate without losing lyrics', () => {
  const p = fresh();
  const result = parseProject({ ...p, version: '0.1', settings: undefined,
    blocks: p.blocks.map(({ language, customTitle, ...b }) => b) });
  expect(result.version).toBe('1.0');
  expect(result.blocks[0].content).toBe(p.blocks[0].content);
  expect(result.blocks[0].language).toBe('auto');
});
test('exports count each section type separately', () => {
  const b = fresh().blocks[0];
  expect(blockTitles(['Verse','Chorus','Verse','Scene','Chorus','Custom'].map(type => ({ ...b, type: type as typeof b.type, customTitle: 'Fin' }))))
    .toEqual(['Verse 1','Chorus 1','Verse 2','Scene','Chorus 2','Fin']);
});
test('project edits update modified while UI changes and loading preserve it', () => {
  const initial = fresh();
  useAppStore.getState().setProject(initial);
  expect(useAppStore.getState().project.metadata.modified).toBe(initial.metadata.modified);
  const actions = [() => useAppStore.getState().setMetadata({title:'Test'}),
    () => useAppStore.getState().updateBlock(initial.blocks[0].id, {language:'en'}),
    () => useAppStore.getState().addBlock(),
    () => useAppStore.getState().duplicateBlock(initial.blocks[0].id),
    () => { const s = useAppStore.getState(); s.reorderBlocks(s.project.blocks[0].id,s.project.blocks[2].id); },
    () => { const s = useAppStore.getState(); s.removeBlock(s.project.blocks.find(b => !b.content)!.id); }];
  for (const action of actions) {
    const before = useAppStore.getState().project.metadata.modified;
    action();
    expect(Date.parse(useAppStore.getState().project.metadata.modified)).toBeGreaterThan(Date.parse(before));
  }
  const before = useAppStore.getState().project.metadata.modified;
  useAppStore.getState().toggleHighlights();
  expect(useAppStore.getState().project.metadata.modified).toBe(before);
});
