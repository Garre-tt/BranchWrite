"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useState } from "react";

type RenameDocumentDialogProps = {
  open: boolean;
  currentTitle: string;
  saving: boolean;
  errorMessage: string | null;
  onOpenChange: (open: boolean) => void;
  onRename: (title: string) => void;
};

export function RenameDocumentDialog({
  open,
  currentTitle,
  saving,
  errorMessage,
  onOpenChange,
  onRename,
}: RenameDocumentDialogProps) {
  const [title, setTitle] = useState(currentTitle);

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) {
          setTitle(currentTitle);
        }
        onOpenChange(nextOpen);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content">
          <Dialog.Title>Rename document</Dialog.Title>
          <Dialog.Description>
            Choose a short title that will be easy to find later.
          </Dialog.Description>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              onRename(title);
            }}
          >
            <label htmlFor="document-title">Document title</label>
            <input
              id="document-title"
              value={title}
              maxLength={200}
              onChange={(event) => setTitle(event.target.value)}
              autoFocus
            />
            {errorMessage ? <p role="alert">{errorMessage}</p> : null}
            <div className="dialog-actions">
              <Dialog.Close asChild>
                <button type="button" className="button-secondary">
                  Cancel
                </button>
              </Dialog.Close>
              <button type="submit" disabled={saving || !title.trim()}>
                {saving ? "Renaming…" : "Rename"}
              </button>
            </div>
          </form>
          <Dialog.Close asChild>
            <button className="dialog-close" aria-label="Close">
              ×
            </button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
