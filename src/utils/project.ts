import type { ProjectData, BlockData } from '../types';

export function parseProject(value: unknown): ProjectData {
  const fail = (message: string): never => { throw new Error('Ungültiges Projekt: ' + message); };
  const object = (v: unknown): Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : fail('Objekt erwartet.');
  const string = (v: unknown): string => typeof v === 'string' ? v : fail('Text erwartet.');
  const choice = (v: unknown, choices: string[]): string => choices.includes(string(v)) ? v as string : fail('Unbekannter Wert: ' + v);
  const date = (v: unknown): string => Number.isFinite(Date.parse(string(v))) ? v as string : fail('Ungültiges Datum.');
  const p = object(value);
  const legacy = p.version === '0.1';
  if (!legacy && p.version !== '1.0') fail('Nicht unterstützte Version: ' + p.version);
  const m = object(p.metadata);
  const settings = object(legacy && p.settings === undefined ? {} : p.settings);
  if (typeof m.tempoBpm !== 'number' || !Number.isFinite(m.tempoBpm) || m.tempoBpm <= 0) fail('Tempo muss positiv sein.');
  const created = date(m.created);
  const defaultLanguage = choice(legacy ? settings.defaultLanguage ?? 'auto' : settings.defaultLanguage, ['auto', 'de', 'en']) as ProjectData['settings']['defaultLanguage'];
  if (!Array.isArray(p.blocks)) fail('Blockliste fehlt.');
  const ids = new Set<string>();
  const blocks = (p.blocks as unknown[]).map(value => {
    const b = object(value);
    const id = string(b.id);
    if (!id.trim() || ids.has(id)) fail('Fehlende oder doppelte Block-ID.');
    ids.add(id);
    const rawTags: unknown[] = b.tags === undefined ? [] : Array.isArray(b.tags) ? b.tags : fail('Tagliste muss ein Array sein.');
    if (rawTags.length > 10) fail('Ein Block darf höchstens 10 Tags haben.');
    const tags = rawTags.map((tag: unknown) => string(tag).trim());
    if (tags.some(tag => !tag || tag.length > 40 || tag.includes('|'))) fail('Ungültiger Block-Tag.');
    if (new Set(tags.map(tag => tag.toLocaleLowerCase())).size !== tags.length) fail('Doppelte Block-Tags.');
    return {
      id,
      type: choice(b.type, ['Intro', 'Verse', 'Pre-Chorus', 'Chorus', 'Bridge', 'Outro', 'Scene', 'Skit', 'Interlude', 'Custom']),
      customTitle: string(legacy ? b.customTitle ?? '' : b.customTitle),
      language: choice(legacy ? b.language ?? defaultLanguage : b.language, ['auto', 'de', 'en']),
      content: string(b.content),
      tags,
    } as BlockData;
  });
  return { version: '1.0', metadata: { title: string(m.title), artist: string(m.artist), tempoBpm: m.tempoBpm as number,
    created, modified: date(legacy ? m.modified ?? created : m.modified) },
    settings: { defaultLanguage, highlightStrictness: choice(legacy ? settings.highlightStrictness ?? 'medium' : settings.highlightStrictness, ['low', 'medium', 'high']) as ProjectData['settings']['highlightStrictness'] }, blocks };
}

export function blockTitles(blocks: BlockData[]): string[] {
  const counts = new Map<string, number>();
  return blocks.map(block => {
    if (block.type === 'Custom') return block.customTitle;
    if (['Scene', 'Skit', 'Interlude'].includes(block.type)) return block.type;
    const count = (counts.get(block.type) ?? 0) + 1;
    counts.set(block.type, count);
    return block.type + ' ' + count;
  });
}

export function blockHeaders(blocks: BlockData[]): string[] {
  return blockTitles(blocks).map((title, index) => [title, ...(blocks[index].tags ?? [])].join(' | '));
}

export function touchProject(project: ProjectData): ProjectData {
  return { ...project, metadata: { ...project.metadata,
    modified: new Date(Math.max(Date.now(), (Date.parse(project.metadata.modified) || 0) + 1)).toISOString() } };
}
