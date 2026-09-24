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
                      Decoration.inline(match.start + 1, match.end + 1, {
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
                    view.state.doc.descendants((node, pos) => {
                      if (node.isText) {
                        text += node.text;
                      } else if (node.isBlock && pos > 0) {
                        text += '\n';
                      }
                    });

                    // Call Tauri API
                    const result = await invoke<{matches: HighlightMatch[]}>('analyze_rhymes', {
                      text: text,
                      lang: currentLang
                    });

                    // We need a way to map the raw string indices back to ProseMirror positions.
                    // For the demo, we assume the backend does this or we ignore it if it's too complex and mock it.

                    const tr = view.state.tr.setMeta('rhymeMatches', result.matches);
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
