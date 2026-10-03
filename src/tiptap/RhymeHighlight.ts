import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { invoke } from '@tauri-apps/api/core';
import { editorText } from '../utils/editorText';

export interface HighlightMatch {
  word: string;
  start: number;
  end: number;
  match_type: string;
  group_id: number;
  partners: { start: number; match_type: string }[];
}

export interface RhymeAnalysisResult {
  matches: HighlightMatch[];
}

export const RhymeHighlight = Extension.create({
  name: 'rhymeHighlight',

  addProseMirrorPlugins() {
    let timeout: any = null;
    let currentLang = 'auto';
    let enabled = true;
    let revision = 0;
    let hoveredWordStart: number | null = null;
    let currentMatches: HighlightMatch[] = [];

    return [
      new Plugin({
        key: new PluginKey('rhymeHighlight'),
        state: {
          init() {
            return DecorationSet.empty;
          },
          apply(tr, oldState) {
            const newMatches: HighlightMatch[] = tr.getMeta('rhymeMatches');
            const newHoverId: number | null = tr.getMeta('hoveredWordStart');
            const toggleMeta = tr.getMeta('showHighlights');
            const language = tr.getMeta('rhymeLanguage');
            if (language !== undefined && language !== currentLang) { currentLang = language; revision++; currentMatches = []; }
            if (tr.docChanged) { revision++; currentMatches = []; hoveredWordStart = null; }
            if (toggleMeta !== undefined) enabled = toggleMeta;

            let matchesToProcess = currentMatches;
            if (newMatches !== undefined) {
              matchesToProcess = newMatches;
              currentMatches = newMatches;
            }
            if (newHoverId !== undefined) {
              hoveredWordStart = newHoverId;
            }

            // Check global toggle (we can pass it via meta)
            // If disabled, just return empty
            if (!enabled) {
              return DecorationSet.empty;
            }

            // Always recalculate decorations if meta changes
            if (newMatches !== undefined || newHoverId !== undefined || toggleMeta !== undefined || language !== undefined || tr.docChanged || tr.selectionSet) {
               // Only the word under the pointer and its direct partners are active.
               const hovered = matchesToProcess.find(m => m.start === hoveredWordStart);
               const active = new Map<number, string>();
               if (hovered) {
                 active.set(hovered.start, hovered.match_type);
                 for (const partner of hovered.partners) active.set(partner.start, partner.match_type);
               }

               const decorations: Decoration[] = [];
               matchesToProcess.forEach(match => {
                 const activeType = active.get(match.start);

                 let className = `hl-${match.match_type}`;
                 if (activeType) {
                    className += ` hover-active hover-active-${activeType}`;
                 }

                 if (match.start >= 0 && match.end <= tr.doc.content.size) {
                   try {
                     decorations.push(
                       Decoration.inline(match.start, match.end, {
                         class: className,
                         'data-group-id': match.group_id.toString(),
                         'data-word-start': match.start.toString()
                       })
                     );
                   } catch (e) {
                     console.error("Invalid decoration position", match);
                   }
                 }
               });
               return DecorationSet.create(tr.doc, decorations);
            }

            return oldState.map(tr.mapping, tr.doc);
          },
        },
        props: {
          decorations(state) {
            return this.getState(state);
          },
          handleDOMEvents: {
            mouseover: (view, event) => {
              const target = (event.target as HTMLElement).closest('[data-word-start]');
              const groupIdStr = target?.getAttribute('data-word-start');
              if (groupIdStr) {
                  const groupId = parseInt(groupIdStr, 10);
                  if (hoveredWordStart !== groupId) {
                      view.dispatch(view.state.tr.setMeta('hoveredWordStart', groupId));
                  }
                  return false;
              }
              if (hoveredWordStart !== null) {
                 view.dispatch(view.state.tr.setMeta('hoveredWordStart', null));
              }
              return false;
            },
            mouseleave: (view, _event) => {
               if (hoveredWordStart !== null) {
                  view.dispatch(view.state.tr.setMeta('hoveredWordStart', null));
               }
               return false;
            }
          }
        },
        view(_editorView) {
          let analyzedRevision = -1;
          let destroyed = false;
          return {
            update(view, prevState) {
              const docChanged = !view.state.doc.eq(prevState.doc);

              if (docChanged || analyzedRevision !== revision) {
                analyzedRevision = revision;
                const requestRevision = revision;
                if (timeout) clearTimeout(timeout);
                timeout = setTimeout(async () => {
                  try {
                    // Extract text
                    const { text, positions } = editorText(view.state.doc, false);

                    // Call Tauri API
                    const result = await invoke<RhymeAnalysisResult>('analyze_rhymes', {
                      text: text,
                      lang: currentLang
                    });

                    if (destroyed || revision !== requestRevision) return;

                    // Map UTF-16 indices to ProseMirror positions
                    const mapToPm = (cIdx: number) => {
                      // fallback for bounds
                      if (cIdx >= positions.length) {
                        return positions.length > 0 ? positions[positions.length-1] + 1 : 1;
                      }
                      return positions[cIdx] ?? 1;
                    };

                    const mappedMatches = result.matches.map(m => ({
                      ...m,
                      start: mapToPm(m.start),
                      end: mapToPm(m.end - 1) + 1,
                      partners: m.partners.map(p => ({ ...p, start: mapToPm(p.start) }))
                    }));

                    const tr = view.state.tr.setMeta('rhymeMatches', mappedMatches);
                    view.dispatch(tr);
                  } catch (e) {
                    console.error(e);
                  }
                }, 150); // Debounce 150ms
              }
            },
            destroy() { destroyed = true; revision++; if (timeout) clearTimeout(timeout); },
          };
        },
      }),
    ];
  },
});
