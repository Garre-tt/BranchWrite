"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";

import {
  createDocument,
  listDocuments,
  loadDocument,
  renameDocument,
} from "@/client/api-client";
import { documentKeys } from "@/client/query-keys";
import type {
  DocumentSummary,
  DraftDocument,
} from "@/domain/document/document-types";
import { DraftEditor, type SaveBarrier } from "@/ui/draft/draft-editor";
import { RenameDocumentDialog } from "@/ui/documents/rename-document-dialog";
import { ProposalWorkspaceEmpty } from "@/ui/proposal/proposal-workspace-empty";
import { ResizableWorkspace } from "@/ui/workspace/resizable-workspace";

function summaryFromDocument(document: DraftDocument): DocumentSummary {
  const { id, title, currentVersion, createdAt, updatedAt } = document;
  return { id, title, currentVersion, createdAt, updatedAt };
}

function documentIdFromPathname(pathname: string): string | undefined {
  const match = /^\/documents\/([^/]+)$/.exec(pathname);
  return match?.[1] ? decodeURIComponent(match[1]) : undefined;
}

export function BranchWriteApp() {
  const router = useRouter();
  const pathname = usePathname();
  const activeDocumentId = documentIdFromPathname(pathname);
  const queryClient = useQueryClient();
  const saveBarriersRef = useRef(new Map<string, SaveBarrier>());
  const [sessionDocuments, setSessionDocuments] = useState<
    Record<string, DraftDocument>
  >({});
  const [navigationError, setNavigationError] = useState<string | null>(null);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);

  const documentsQuery = useQuery({
    queryKey: documentKeys.all,
    queryFn: listDocuments,
  });
  const documentQuery = useQuery({
    queryKey: activeDocumentId
      ? documentKeys.detail(activeDocumentId)
      : ["documents", "none"],
    queryFn: () => loadDocument(activeDocumentId!),
    enabled: Boolean(activeDocumentId),
  });

  const updateDocumentCaches = useCallback(
    (document: DraftDocument) => {
      setSessionDocuments((current) => ({
        ...current,
        [document.id]: document,
      }));
      queryClient.setQueryData(documentKeys.detail(document.id), document);
      queryClient.setQueryData<DocumentSummary[]>(
        documentKeys.all,
        (current = []) => {
          const nextSummary = summaryFromDocument(document);
          const existingIndex = current.findIndex(
            (entry) => entry.id === document.id,
          );
          const next =
            existingIndex === -1
              ? [nextSummary, ...current]
              : current.map((entry) =>
                  entry.id === document.id ? nextSummary : entry,
                );
          return [...next].sort((left, right) =>
            right.updatedAt.localeCompare(left.updatedAt),
          );
        },
      );
    },
    [queryClient, setSessionDocuments],
  );

  const crossSaveBarrier = useCallback(async () => {
    const barrier = activeDocumentId
      ? saveBarriersRef.current.get(activeDocumentId)
      : undefined;
    const saved = await (barrier?.() ?? Promise.resolve(true));
    if (!saved) {
      setNavigationError(
        "Save this draft successfully before opening another document.",
      );
    } else {
      setNavigationError(null);
    }
    return saved;
  }, [activeDocumentId, setNavigationError]);

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!(await crossSaveBarrier())) {
        throw new Error("The current draft must be saved first.");
      }
      return createDocument();
    },
    onSuccess: (created) => {
      updateDocumentCaches(created);
      router.push(`/documents/${created.id}`);
    },
  });

  const renameMutation = useMutation({
    mutationFn: (title: string) => renameDocument(activeDocumentId!, title),
    onMutate: () => setRenameError(null),
    onSuccess: (renamed) => {
      updateDocumentCaches(renamed);
      setRenameOpen(false);
    },
    onError: (error) => {
      setRenameError(error instanceof Error ? error.message : "Rename failed.");
    },
  });

  async function openDocument(documentId: string) {
    if (documentId === activeDocumentId) {
      return;
    }
    if (await crossSaveBarrier()) {
      try {
        const nextDocument = await queryClient.ensureQueryData({
          queryKey: documentKeys.detail(documentId),
          queryFn: () => loadDocument(documentId),
        });
        setSessionDocuments((current) => ({
          ...current,
          ...(activeDocument ? { [activeDocument.id]: activeDocument } : {}),
          [nextDocument.id]: current[nextDocument.id] ?? nextDocument,
        }));
        router.push(`/documents/${documentId}`);
      } catch (error) {
        setNavigationError(
          error instanceof Error
            ? error.message
            : "This document could not be opened.",
        );
      }
    }
  }

  const activeDocument = activeDocumentId
    ? (sessionDocuments[activeDocumentId] ?? documentQuery.data)
    : undefined;
  const editorSessions = activeDocument
    ? {
        ...sessionDocuments,
        [activeDocument.id]:
          sessionDocuments[activeDocument.id] ?? activeDocument,
      }
    : sessionDocuments;

  return (
    <main className="app-shell">
      <aside className="document-sidebar" aria-label="Documents">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            B
          </div>
          <div>
            <span>BranchWrite</span>
            <small>Local writing workspace</small>
          </div>
        </div>
        <button
          type="button"
          className="new-document-button"
          onClick={() => createMutation.mutate()}
          disabled={createMutation.isPending}
        >
          <span aria-hidden="true">＋</span>
          {createMutation.isPending ? "Creating…" : "New document"}
        </button>
        <div className="document-list-heading">
          <span>Your documents</span>
          <span>{documentsQuery.data?.length ?? 0}</span>
        </div>
        {documentsQuery.isLoading ? (
          <p className="sidebar-status">Loading documents…</p>
        ) : documentsQuery.isError ? (
          <div className="sidebar-error" role="alert">
            <p>Documents could not be loaded.</p>
            <button type="button" onClick={() => void documentsQuery.refetch()}>
              Retry
            </button>
          </div>
        ) : (
          <nav className="document-list" aria-label="Your documents">
            {documentsQuery.data?.map((document) => (
              <button
                type="button"
                key={document.id}
                className={
                  document.id === activeDocumentId
                    ? "document-list-item active"
                    : "document-list-item"
                }
                aria-current={
                  document.id === activeDocumentId ? "page" : undefined
                }
                onClick={() => void openDocument(document.id)}
              >
                <span>{document.title}</span>
                <small>
                  {new Intl.DateTimeFormat(undefined, {
                    month: "short",
                    day: "numeric",
                  }).format(new Date(document.updatedAt))}
                </small>
              </button>
            ))}
          </nav>
        )}
        <p className="local-only-note">
          <span aria-hidden="true">●</span> Stored locally on this device
        </p>
      </aside>

      <div className="workspace-area">
        {navigationError ? (
          <div className="navigation-error" role="alert">
            {navigationError}
          </div>
        ) : null}
        {createMutation.isError ? (
          <div className="navigation-error" role="alert">
            {createMutation.error.message}
          </div>
        ) : null}
        {!activeDocumentId ? (
          <section className="welcome-state">
            <p className="panel-kicker">My Draft is always authoritative</p>
            <h1>Start with your own words.</h1>
            <p>
              Create a document or open one from the sidebar. BranchWrite keeps
              proposed writing separate from the draft you control.
            </p>
            <button
              type="button"
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending}
            >
              Create your first document
            </button>
          </section>
        ) : documentQuery.isLoading ? (
          <div className="workspace-loading">Opening your document…</div>
        ) : documentQuery.isError || !activeDocument ? (
          <section className="workspace-error" role="alert">
            <h1>This document could not be opened.</h1>
            <p>
              {documentQuery.error instanceof Error
                ? documentQuery.error.message
                : "The saved document is unavailable."}
            </p>
            <button type="button" onClick={() => router.push("/")}>
              Return to documents
            </button>
          </section>
        ) : (
          <>
            <header className="workspace-header">
              <div>
                <p className="panel-kicker">Current document</p>
                <h1>{activeDocument.title}</h1>
              </div>
              <button
                type="button"
                className="button-secondary"
                onClick={() => setRenameOpen(true)}
              >
                Rename
              </button>
            </header>
            <ResizableWorkspace
              primary={
                <section
                  className="draft-panel"
                  aria-labelledby="draft-heading"
                >
                  <div className="panel-heading">
                    <div>
                      <p className="panel-kicker">Authoritative document</p>
                      <h2 id="draft-heading">My Draft</h2>
                    </div>
                    <span className="authority-badge">Source of truth</span>
                  </div>
                  {Object.values(editorSessions).map((sessionDocument) => (
                    <div
                      key={sessionDocument.id}
                      hidden={sessionDocument.id !== activeDocumentId}
                    >
                      <DraftEditor
                        document={sessionDocument}
                        onSaved={updateDocumentCaches}
                        registerSaveBarrier={(barrier) => {
                          if (barrier) {
                            saveBarriersRef.current.set(
                              sessionDocument.id,
                              barrier,
                            );
                          } else {
                            saveBarriersRef.current.delete(sessionDocument.id);
                          }
                        }}
                      />
                    </div>
                  ))}
                </section>
              }
              secondary={<ProposalWorkspaceEmpty />}
            />
            <RenameDocumentDialog
              open={renameOpen}
              currentTitle={activeDocument.title}
              saving={renameMutation.isPending}
              errorMessage={renameError}
              onOpenChange={setRenameOpen}
              onRename={(title) => renameMutation.mutate(title)}
            />
          </>
        )}
      </div>
    </main>
  );
}
