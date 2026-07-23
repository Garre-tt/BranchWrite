import { Extension } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";

import type { TopLevelSignature } from "@/domain/proposal/topology";

function signatureMatches(
  expected: TopLevelSignature,
  document: Parameters<
    NonNullable<Plugin["spec"]["filterTransaction"]>
  >[0]["doc"],
): boolean {
  if (document.childCount !== expected.length) return false;
  return expected.every((block, index) => {
    const candidate = document.child(index);
    return (
      candidate.type.name === block.type && candidate.attrs.id === block.id
    );
  });
}

export const TopologyGuardExtension = Extension.create<{
  expected: TopLevelSignature;
  onRejected: () => void;
}>({
  name: "topologyGuard",

  addOptions() {
    return { expected: [], onRejected: () => undefined };
  },

  addProseMirrorPlugins() {
    const { expected, onRejected } = this.options;
    return [
      new Plugin({
        filterTransaction(transaction) {
          if (
            !transaction.docChanged ||
            signatureMatches(expected, transaction.doc)
          ) {
            return true;
          }
          onRejected();
          return false;
        },
      }),
    ];
  },
});
