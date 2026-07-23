import { Extension } from "@tiptap/core";
import { Plugin, type Transaction } from "@tiptap/pm/state";

export type BlockIdGenerator = () => string;

function defaultBlockIdGenerator(): string {
  return globalThis.crypto.randomUUID();
}

export function assignMissingTopLevelBlockIds(
  transaction: Transaction,
  generateId: BlockIdGenerator = defaultBlockIdGenerator,
): boolean {
  const seen = new Set<string>();
  let changed = false;

  transaction.doc.forEach((block, offset) => {
    const currentId: unknown = block.attrs.id;
    if (
      typeof currentId === "string" &&
      currentId.length > 0 &&
      !seen.has(currentId)
    ) {
      seen.add(currentId);
      return;
    }

    let nextId = generateId();
    while (seen.has(nextId)) {
      nextId = generateId();
    }

    transaction.setNodeMarkup(offset, undefined, {
      ...block.attrs,
      id: nextId,
    });
    seen.add(nextId);
    changed = true;
  });

  return changed;
}

export const BlockIdExtension = Extension.create<{
  generateId: BlockIdGenerator;
}>({
  name: "branchWriteBlockIds",

  addOptions() {
    return {
      generateId: defaultBlockIdGenerator,
    };
  },

  addProseMirrorPlugins() {
    const generateId = this.options.generateId;

    return [
      new Plugin({
        appendTransaction: (transactions, _oldState, newState) => {
          if (!transactions.some((transaction) => transaction.docChanged)) {
            return null;
          }

          const transaction = newState.tr;
          return assignMissingTopLevelBlockIds(transaction, generateId)
            ? transaction
            : null;
        },
      }),
    ];
  },
});
