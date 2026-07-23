import { history, undo } from "@tiptap/pm/history";
import { EditorState, type Transaction } from "@tiptap/pm/state";
import { describe, expect, it } from "vitest";

import {
  HISTORY_DEPTH,
  HISTORY_NEW_GROUP_DELAY_MS,
} from "../../src/editor/history-config";
import { createEditorSchema } from "../../src/editor/schema";

function createHistoryState() {
  const schema = createEditorSchema();
  return EditorState.create({
    schema,
    doc: schema.nodeFromJSON({
      type: "doc",
      content: [{ type: "paragraph", attrs: { id: "paragraph" } }],
    }),
    plugins: [
      history({
        depth: HISTORY_DEPTH,
        newGroupDelay: HISTORY_NEW_GROUP_DELAY_MS,
      }),
    ],
  });
}

function insertText(
  state: EditorState,
  text: string,
  position: number,
  time: number,
) {
  return state.apply(state.tr.insertText(text, position).setTime(time));
}

function undoOnce(state: EditorState): EditorState {
  let nextState: EditorState | undefined;
  const handled = undo(state, (transaction: Transaction) => {
    nextState = state.apply(transaction);
  });

  expect(handled).toBe(true);
  return nextState!;
}

describe("professional typing history grouping", () => {
  it("undoes adjacent typing within one 750ms burst as one action", () => {
    let state = createHistoryState();
    state = insertText(state, "hello", 1, 1_000);
    state = insertText(
      state,
      " world",
      6,
      1_000 + HISTORY_NEW_GROUP_DELAY_MS - 1,
    );

    expect(undoOnce(state).doc.textContent).toBe("");
  });

  it("starts a new undo group after a meaningful pause", () => {
    let state = createHistoryState();
    state = insertText(state, "hello", 1, 1_000);
    state = insertText(
      state,
      " world",
      6,
      1_000 + HISTORY_NEW_GROUP_DELAY_MS + 1,
    );

    expect(undoOnce(state).doc.textContent).toBe("hello");
  });
});
