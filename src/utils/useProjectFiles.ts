import { useEffect, useRef, useState } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { ask } from '@tauri-apps/plugin-dialog';
import { useAppStore } from '../store';
import { openProject, saveProject, exportToMarkdown, exportToText } from './fileManager';

export function useProjectFiles() {
  const project = useAppStore(state => state.project);
  const saved = useRef(project);
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [hasFile, setHasFile] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const dirty = project !== saved.current;

  const confirmDiscard = async () => {
    const text = 'Ungespeicherte Änderungen gehen verloren. Trotzdem fortfahren?';
    return isTauri()
      ? ask(text, { title: 'LyricForge', kind: 'warning', okLabel: 'Verwerfen', cancelLabel: 'Abbrechen' })
      : window.confirm(text);
  };

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (useAppStore.getState().project !== saved.current || busyRef.current) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', beforeUnload);
    let disposed = false;
    let unlisten: (() => void) | undefined;
    if (isTauri()) {
      getCurrentWindow().onCloseRequested(async event => {
        event.preventDefault();
        if (busyRef.current) return;
        busyRef.current = true;
        try {
          if (useAppStore.getState().project === saved.current || await confirmDiscard()) {
            await getCurrentWindow().destroy();
          }
        } catch (cause) {
          setError(`Fenster konnte nicht geschlossen werden: ${String(cause)}`);
        } finally { busyRef.current = false; }
      }).then(stop => { if (disposed) stop(); else unlisten = stop; })
        .catch(cause => setError(`Schutz beim Schließen konnte nicht aktiviert werden: ${String(cause)}`));
    }
    return () => { disposed = true; unlisten?.(); window.removeEventListener('beforeunload', beforeUnload); };
  }, []);

  const run = async (operation: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    setMessage('');
    try { await operation(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { busyRef.current = false; setBusy(false); }
  };

  return {
    busy, error, message,
    status: dirty ? 'Ungespeicherte Änderungen' : hasFile ? 'Gespeichert' : 'Noch nicht gespeichert',
    handleSave: () => run(async () => {
      const snapshot = useAppStore.getState().project;
      if (await saveProject(snapshot)) {
        saved.current = snapshot;
        setHasFile(true);
        setMessage(useAppStore.getState().project === snapshot ? 'Projekt gespeichert.' : 'Stand gespeichert; neuere Änderungen sind noch ungespeichert.');
      } else setMessage('Speichern abgebrochen.');
    }),
    handleOpen: () => run(async () => {
      const snapshot = useAppStore.getState().project;
      if (snapshot !== saved.current && !await confirmDiscard()) return;
      const loaded = await openProject();
      if (!loaded) return;
      if (useAppStore.getState().project !== snapshot && !await confirmDiscard()) return;
      useAppStore.getState().setProject(loaded);
      saved.current = useAppStore.getState().project;
      setHasFile(true);
      setMessage('Projekt geöffnet.');
    }),
    handleExportMd: () => run(async () => {
      setMessage(await exportToMarkdown(useAppStore.getState().project) ? 'Markdown exportiert.' : 'Export abgebrochen.');
    }),
    handleExportTxt: () => run(async () => {
      setMessage(await exportToText(useAppStore.getState().project) ? 'Text exportiert.' : 'Export abgebrochen.');
    }),
  };
}
