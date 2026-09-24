import { save, open } from '@tauri-apps/plugin-dialog';
import { writeTextFile, readTextFile } from '@tauri-apps/plugin-fs';
import { ProjectData } from '../types';

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
    console.error('Failed to save project:', error);
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
      return JSON.parse(contents) as ProjectData;
    }
  } catch (error) {
    console.error('Failed to open project:', error);
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

      project.blocks.forEach((block, idx) => {
        const title = block.type === 'Custom' ? block.customTitle : block.type;
        content += `## ${title} ${block.type !== 'Custom' && block.type !== 'Scene' && block.type !== 'Skit' && block.type !== 'Interlude' ? idx + 1 : ''}\n`;
        content += `${block.content}\n\n`;
      });

      await writeTextFile(filePath, content);
      return true;
    }
  } catch (error) {
    console.error('Failed to export to markdown:', error);
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

      project.blocks.forEach((block, idx) => {
        const title = block.type === 'Custom' ? block.customTitle : block.type;
        content += `[${title} ${block.type !== 'Custom' && block.type !== 'Scene' && block.type !== 'Skit' && block.type !== 'Interlude' ? idx + 1 : ''}]\n`;
        content += `${block.content}\n\n`;
      });

      await writeTextFile(filePath, content);
      return true;
    }
  } catch (error) {
    console.error('Failed to export to text:', error);
  }
  return false;
};
