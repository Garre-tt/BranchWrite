import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

import {
  InvalidProposalScopeError,
  resolveEditorScope,
  type ResolvedEditorScope,
} from "@/domain/proposal/scope";

const scopeDecorationKey = new PluginKey<ResolvedEditorScope | null>(
  "proposalScopeDecoration",
);

export const ScopeDecorationExtension = Extension.create<{
  onScopeChange: (scope: ResolvedEditorScope) => void;
}>({
  name: "proposalScopeDecoration",

  addOptions() {
    return { onScopeChange: () => undefined };
  },

  addProseMirrorPlugins() {
    const onScopeChange = this.options.onScopeChange;
    return [
      new Plugin({
        key: scopeDecorationKey,
        state: {
          init: (_config, state) => {
            try {
              return resolveEditorScope(
                state.doc,
                state.selection.from,
                state.selection.to,
              );
            } catch {
              return null;
            }
          },
          apply: (_transaction, _scope, _oldState, newState) => {
            try {
              return resolveEditorScope(
                newState.doc,
                newState.selection.from,
                newState.selection.to,
              );
            } catch {
              return null;
            }
          },
        },
        view: (view) => {
          const initialScope = scopeDecorationKey.getState(view.state);
          if (initialScope) {
            queueMicrotask(() => onScopeChange(initialScope));
          }
          return {
            update(updatedView, previousState) {
              if (
                updatedView.state.doc === previousState.doc &&
                updatedView.state.selection.eq(previousState.selection)
              ) {
                return;
              }
              const scope = scopeDecorationKey.getState(updatedView.state);
              if (scope) onScopeChange(scope);
            },
          };
        },
        props: {
          decorations(state) {
            const scope = scopeDecorationKey.getState(state);
            if (!scope) return DecorationSet.empty;
            const selected = new Set(scope.blockIds);
            const decorations: Decoration[] = [];
            state.doc.forEach((block, offset) => {
              if (selected.has(String(block.attrs.id))) {
                decorations.push(
                  Decoration.node(offset, offset + block.nodeSize, {
                    class: "proposal-scope-block",
                  }),
                );
              }
            });
            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },
});

export function readCurrentEditorScope(
  editorState: Parameters<typeof scopeDecorationKey.getState>[0],
): ResolvedEditorScope {
  const scope = scopeDecorationKey.getState(editorState);
  if (!scope) throw new InvalidProposalScopeError();
  return scope;
}
