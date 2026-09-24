export type BlockType = 'Intro' | 'Verse' | 'Pre-Chorus' | 'Chorus' | 'Bridge' | 'Outro' | 'Scene' | 'Skit' | 'Interlude' | 'Custom';
export type Language = 'auto' | 'de' | 'en';

export interface BlockData {
  id: string;
  type: BlockType;
  customTitle: string;
  language: Language;
  content: string;
}

export interface ProjectMetadata {
  title: string;
  artist: string;
  tempoBpm: number;
  created: string;
  modified: string;
}

export interface ProjectSettings {
  defaultLanguage: Language;
  highlightStrictness: 'low' | 'medium' | 'high';
}

export interface ProjectData {
  version: string;
  metadata: ProjectMetadata;
  settings: ProjectSettings;
  blocks: BlockData[];
}
