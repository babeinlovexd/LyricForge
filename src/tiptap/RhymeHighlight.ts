import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { invoke } from '@tauri-apps/api/core';

export interface HighlightMatch {
  word: string;
  start: number;
  end: number;
  match_type: string;
  group_id: number;
}

export interface RhymeAnalysisResult {
  matches: HighlightMatch[];
}

export const RhymeHighlight = Extension.create({
  name: 'rhymeHighlight',

  addProseMirrorPlugins() {
    let timeout: any = null;
    let currentLang = 'auto'; // We'll need a way to pass this
    let hoveredGroupId: number | null = null;
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
            const newHoverId: number | null = tr.getMeta('hoveredGroupId');
            const toggleMeta = tr.getMeta('highlightsEnabled');

            let matchesToProcess = currentMatches;
            if (newMatches !== undefined) {
              matchesToProcess = newMatches;
              currentMatches = newMatches;
            }
            if (newHoverId !== undefined) {
              hoveredGroupId = newHoverId;
            }

            // Check global toggle (we can pass it via meta)
            // If disabled, just return empty
            if (toggleMeta === false) {
              return DecorationSet.empty;
            }

            // Always recalculate decorations if meta changes
            if (newMatches !== undefined || newHoverId !== undefined || toggleMeta !== undefined || tr.docChanged || tr.selectionSet) {
               // Determine cursor position to auto-hover
               const { from, to } = tr.selection;
               const isCursorHover = from === to;
               let activeGroupIds = new Set<number>();

               if (hoveredGroupId !== null) {
                 activeGroupIds.add(hoveredGroupId);
               }

               if (isCursorHover) {
                 matchesToProcess.forEach(m => {
                   if (from >= m.start && from <= m.end) {
                     activeGroupIds.add(m.group_id);
                   }
                 });
               }

               const decorations: Decoration[] = [];
               matchesToProcess.forEach(match => {
                 const isActive = activeGroupIds.has(match.group_id);

                 // If not active, only show permanent ones
                 if (!isActive && match.match_type !== 'moss-green' && match.match_type !== 'light-green') {
                    return; // Skip rendering
                 }

                 let className = `rhyme-${match.match_type}`;

                 if (match.start >= 0 && match.end <= tr.doc.content.size) {
                   try {
                     decorations.push(
                       Decoration.inline(match.start, match.end, {
                         class: `${className} group-id-${match.group_id}`,
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
              const target = event.target as HTMLElement;
              if (target.classList) {
                 const match = Array.from(target.classList).find(c => c.startsWith('group-id-'));
                 if (match) {
                    const groupId = parseInt(match.replace('group-id-', ''), 10);
                    if (hoveredGroupId !== groupId) {
                       view.dispatch(view.state.tr.setMeta('hoveredGroupId', groupId));
                    }
                    return false;
                 }
              }
              if (hoveredGroupId !== null) {
                 view.dispatch(view.state.tr.setMeta('hoveredGroupId', null));
              }
              return false;
            }
          }
        },
        view(_editorView) {
          return {
            update(view, prevState) {
              const docChanged = !view.state.doc.eq(prevState.doc);

              if (docChanged) {
                if (timeout) clearTimeout(timeout);
                timeout = setTimeout(async () => {
                  try {
                    // Extract text
                    let text = '';
                    const positions: { pmPos: number; charIdx: number }[] = [];
                    let charIdx = 0;

                    view.state.doc.descendants((node, pos) => {
                      if (node.isText) {
                        const nodeText = node.text || '';
                        for (let i = 0; i < nodeText.length; i++) {
                            positions.push({ pmPos: pos + i, charIdx: charIdx + i });
                        }
                        text += nodeText;
                        charIdx += nodeText.length;
                      } else if (node.isBlock && pos > 0) {
                        text += '\n';
                        positions.push({ pmPos: pos, charIdx: charIdx });
                        charIdx += 1;
                      }
                    });

                    // Call Tauri API
                    const result = await invoke<RhymeAnalysisResult>('analyze_rhymes', {
                      text: text,
                      lang: currentLang
                    });

                    // Map char indices to ProseMirror positions
                    const mapToPm = (cIdx: number) => {
                      // fallback for bounds
                      if (cIdx >= positions.length) {
                        return positions.length > 0 ? positions[positions.length-1].pmPos + 1 : 1;
                      }
                      return positions[cIdx] ? positions[cIdx].pmPos : 1;
                    };

                    const mappedMatches = result.matches.map(m => ({
                      ...m,
                      start: mapToPm(m.start) + 1,
                      end: mapToPm(m.end) + 1
                    }));

                    const tr = view.state.tr.setMeta('rhymeMatches', mappedMatches);
                    view.dispatch(tr);
                  } catch (e) {
                    console.error(e);
                  }
                }, 150); // Debounce 150ms
              }
            },
          };
        },
      }),
    ];
  },
});
