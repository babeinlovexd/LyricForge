import { save, open } from '@tauri-apps/plugin-dialog';
import { writeTextFile, readTextFile } from '@tauri-apps/plugin-fs';
import { ProjectData } from '../types';
import { parseProject, blockHeaders } from './project';

export const saveProject = async (project: ProjectData) => {
  try {
    const filePath = await save({
      filters: [{ name: 'LyricForge Project', extensions: ['lyricproj'] }],
    });
    if (filePath) {
      await writeTextFile(filePath, JSON.stringify(project, null, 2));
      return true;
    }
  } catch (error) {
    throw new Error(`Projekt konnte nicht gespeichert werden: ${error instanceof Error ? error.message : String(error)}`);
  }
  return false;
};

export const openProject = async (): Promise<ProjectData | null> => {
  try {
    const selected = await open({
      filters: [{ name: 'LyricForge Project', extensions: ['lyricproj'] }],
    });

    if (selected && typeof selected === 'string') {
      const contents = await readTextFile(selected);
      return parseProject(JSON.parse(contents));
    }
  } catch (error) {
    throw new Error(`Projekt konnte nicht geöffnet werden: ${error instanceof Error ? error.message : String(error)}`);
  }
  return null;
};

export const exportToMarkdown = async (project: ProjectData) => {
  try {
    const filePath = await save({
      filters: [{ name: 'Markdown File', extensions: ['md'] }],
    });

    if (filePath) {
      let content = `# ${project.metadata.title}\nArtist: ${project.metadata.artist}\nTempo: ${project.metadata.tempoBpm} BPM\n\n`;

      const titles = blockHeaders(project.blocks);
      project.blocks.forEach((block, idx) => {
        const title = titles[idx];
        content += `## ${title}\n`;
        content += `${block.content}\n\n`;
      });

      await writeTextFile(filePath, content);
      return true;
    }
  } catch (error) {
    throw new Error(`Markdown-Export fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`);
  }
  return false;
};

export const exportToText = async (project: ProjectData) => {
  try {
    const filePath = await save({
      filters: [{ name: 'Text File', extensions: ['txt'] }],
    });

    if (filePath) {
      let content = `${project.metadata.title} - ${project.metadata.artist}\n\n`;

      const titles = blockHeaders(project.blocks);
      project.blocks.forEach((block, idx) => {
        const title = titles[idx];
        content += `[${title}]\n`;
        content += `${block.content}\n\n`;
      });

      await writeTextFile(filePath, content);
      return true;
    }
  } catch (error) {
    throw new Error(`Text-Export fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`);
  }
  return false;
};
