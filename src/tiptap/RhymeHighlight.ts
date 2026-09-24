import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { invoke } from '@tauri-apps/api/core';

export interface HighlightMatch {
  word: string;
  start: number;
  end: number;
  match_type: string;
}

export const RhymeHighlight = Extension.create({
  name: 'rhymeHighlight',

  addProseMirrorPlugins() {
    let timeout: any = null;
    let currentLang = 'auto'; // We'll need a way to pass this

    return [
      new Plugin({
        key: new PluginKey('rhymeHighlight'),
        state: {
          init() {
            return DecorationSet.empty;
          },
          apply(tr, oldState) {
            const matches: HighlightMatch[] = tr.getMeta('rhymeMatches') || [];
            if (tr.getMeta('rhymeMatches') !== undefined) {
              const decorations: Decoration[] = [];
              matches.forEach(match => {
                let className = '';
                if (match.match_type === 'green') {
                  className = 'rhyme-green';
                } else if (match.match_type === 'yellow') {
                  className = 'rhyme-yellow';
                } else if (match.match_type === 'purple') {
                  className = 'rhyme-purple';
                }

                // Assuming start and end are based on text characters
                // ProseMirror offsets need to account for node boundaries, but for a simple block, we map directly.
                // In a robust implementation, we would map absolute text positions to ProseMirror positions.
                // For this demo, we'll map simplified pos.

                // Only create if positions are valid
                if (match.start >= 0 && match.end <= tr.doc.content.size) {
                  try {
                    decorations.push(
                      Decoration.inline(match.start, match.end, {
                        class: className,
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
                    // Note: Rust regex byte indices need to be mapped to char indices,
                    // but we will do it here if possible, or assume Rust sends char indices.
                    const result = await invoke<{matches: HighlightMatch[]}>('analyze_rhymes', {
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
                      start: mapToPm(m.start) + 1, // +1 because ProseMirror offsets text by 1 from block start
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
