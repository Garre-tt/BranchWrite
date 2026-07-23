# BranchWrite MVP Implementation Roadmap

## 1. Purpose and delivery constraints

This roadmap implements `PLAN.md` as written. The product is a local, single-user engineering demonstration of one workflow:

1. Write in **My Draft**.
2. Select complete top-level blocks.
3. Generate a deterministic Proposal.
4. Review or edit its Alternative in a separate workspace.
5. Explicitly accept a sentence, block, or fully reviewed section.
6. Merge only after server-side validation.
7. Revert the immediately eligible Merge.

The following invariants are non-negotiable and should be encoded in module boundaries, database transactions, and automated tests:

- The persisted Canonical Draft is the only authoritative document.
- Generation, Alternative editing, and diff calculation cannot write Canonical Draft content.
- A completed Proposal is immutable.
- An Alternative is mutable but never aliases Proposal or Canonical Draft JSON in memory.
- Only `MergeService` may change Canonical Draft content as a result of acceptance.
- Every Merge is validated against persisted state, not trusted client state.
- A stale or ambiguous target fails closed; the application never relocates content.
- Every accepted Merge and every Revert creates immutable revision history.
- Unsupported rich-text content is removed before it can reach persistence.
- No future sources, templates, model providers, collaboration, export, or branch-management UI is implemented.

## 2. High-level architecture

Use a modular monolith. The browser provides the two editor surfaces and review UI; a local Next.js Node process owns validation, persistence, generation, diffing, and merging.

```text
Browser
  ├─ My Draft editor (Canonical Draft working copy)
  ├─ Proposal Workspace editor (selected Alternative only)
  ├─ Review renderer
  └─ Autosave/save-barrier coordinators
             │ localhost HTTP
             ▼
Next.js route handlers
  ├─ Parse request with Zod
  ├─ Call one application service
  └─ Map domain result to HTTP response
             │
             ▼
Application/domain services
  ├─ DocumentService
  ├─ ProposalService
  │    └─ ProposalGenerator interface
  ├─ AlternativeService
  ├─ DiffService
  ├─ MergeService
  └─ RevisionService
             │
             ▼
Repositories and transaction boundary
  └─ Drizzle + SQLite
```

### Ownership boundaries

| Area | Owns | Must not own |
|---|---|---|
| My Draft editor | In-session editable ProseMirror state and selection | Proposal or Alternative mutation |
| Proposal Workspace | Selected Alternative editor state and review presentation | Any Canonical Draft write path |
| Autosave coordinators | Debouncing, ordered saves, flush barriers, error state | Merge logic |
| Proposal generator | Pure structured transformation | Repositories or Canonical Draft mutation |
| Diff service | Immutable description of differences | Editor transactions or persistence side effects other than saving a snapshot through its application service |
| Merge service | Acceptance validation and atomic Canonical Draft changes | Generation or UI state |
| Repositories | SQL and transaction-scoped persistence | Product decisions |

The domain layer should not import React, Next.js, Tiptap UI packages, or browser APIs. The fixed ProseMirror schema and its serialization utilities are shared by browser and server. SQLite-dependent code stays behind repositories.

## 3. Technology stack recommendations

The specification fixes the main stack. The recommendations below make the choices concrete without adding product scope.

| Choice | Recommendation and justification |
|---|---|
| Framework | **Next.js App Router on the Node runtime.** Route handlers give explicit local HTTP boundaries and keep transactional logic server-side. Do not use Edge runtime because SQLite and `better-sqlite3` require Node. Do not use Server Actions for core mutations; explicit route contracts are easier to integration-test and abort. |
| UI | **React with TypeScript strict mode.** Keep editor state inside ProseMirror, remote data in TanStack Query, and small ephemeral UI state in component reducers/context. Avoid Redux or Zustand until a demonstrated need exists. |
| Rich text | **Tiptap over ProseMirror**, using only the schema extensions required by the specification. Tiptap simplifies editor composition; ProseMirror primitives provide deterministic selection resolution, JSON parsing, slices, and server-side transforms. |
| Database | **SQLite with WAL mode and foreign keys enabled.** It fits a local single-user application, supports atomic merge transactions, and has no service dependency. Use one application-controlled database path, not an in-memory production database. |
| SQLite driver | **`better-sqlite3`.** Its synchronous transaction semantics are simple and reliable for short local mutations. All expensive diff/generation work occurs before opening a write transaction. |
| ORM/migrations | **Drizzle ORM and checked-in Drizzle Kit migrations.** Drizzle keeps schemas and SQL visible, works well with SQLite, and avoids a heavy runtime. Never use schema “push” as the normal demo startup path. |
| Runtime validation | **Zod at every HTTP, persisted-JSON, generator-output, and diff-snapshot boundary.** TypeScript types alone do not protect stored JSON or client requests. ProseMirror `Node.fromJSON` validation follows Zod shape validation. |
| Server-state client | **TanStack Query.** It provides mutation state, explicit invalidation, retry control, and cache separation between documents, Alternatives, and reviews. Disable automatic retries for merge/conflict responses. |
| Styling and primitives | **Radix UI primitives plus CSS Modules and CSS custom-property design tokens.** This provides accessible dialogs, drawers, tooltips, and focus management without imposing a visual system or large utility layer. |
| Hashing | **Node `crypto` SHA-256 over canonical JSON.** Use one canonical serializer and include schema/version tags in hash inputs. Never hash raw `JSON.stringify` output from arbitrary objects. |
| Text comparison | **A pinned `diff`/jsdiff version for word-level presentation only.** Block alignment and acceptance eligibility remain first-party domain logic. Pinning avoids output drift. |
| IDs | **UUID v7 or Nano ID generated in application code.** IDs are opaque strings. Stable top-level block IDs are generated once and retained through all transformations and merges. |
| Unit/integration tests | **Vitest, Testing Library, and a temporary on-disk SQLite database per test worker.** Real SQLite transactions should be exercised rather than mocked for merge/revision behavior. |
| End-to-end tests | **Playwright with `@axe-core/playwright`.** It covers real editor selection, paste, keyboard navigation, persistence after reload, and baseline accessibility. |
| Optional test utility | **fast-check for invariants**, limited to canonical serialization, generator determinism, and topology preservation. It is test-only and does not affect product behavior. |

Run production demos with a local `next build`/`next start` Node process. “No network dependency” means no external service or internet call; browser-to-localhost communication is still required. Do not target Vercel or another serverless environment for the MVP.

## 4. Proposed project and file structure

Organize by domain feature, with shared schema and persistence separated from UI:

```text
/
├─ app/
│  ├─ layout.tsx
│  ├─ page.tsx
│  ├─ documents/[documentId]/page.tsx
│  └─ api/
│     ├─ documents/route.ts
│     ├─ documents/[documentId]/route.ts
│     ├─ documents/[documentId]/content/route.ts
│     ├─ documents/[documentId]/revert-latest/route.ts
│     ├─ proposals/generate/route.ts
│     ├─ alternatives/[alternativeId]/route.ts
│     ├─ alternatives/[alternativeId]/content/route.ts
│     ├─ alternatives/[alternativeId]/review/route.ts
│     └─ merges/route.ts
├─ src/
│  ├─ domain/
│  │  ├─ document/
│  │  │  ├─ document-types.ts
│  │  │  ├─ document-service.ts
│  │  │  └─ document-errors.ts
│  │  ├─ proposal/
│  │  │  ├─ proposal-types.ts
│  │  │  ├─ proposal-generator.ts
│  │  │  ├─ deterministic-mock-generator.ts
│  │  │  ├─ prompt-normalization.ts
│  │  │  └─ proposal-service.ts
│  │  ├─ alternative/
│  │  │  ├─ alternative-types.ts
│  │  │  └─ alternative-service.ts
│  │  ├─ review/
│  │  │  ├─ diff-types.ts
│  │  │  ├─ diff-service.ts
│  │  │  ├─ sentence-segmentation.ts
│  │  │  ├─ sentence-alignment.ts
│  │  │  └─ formatting-diff.ts
│  │  ├─ merge/
│  │  │  ├─ merge-types.ts
│  │  │  ├─ merge-service.ts
│  │  │  ├─ merge-validation.ts
│  │  │  └─ merge-transform.ts
│  │  └─ revision/
│  │     └─ revision-service.ts
│  ├─ editor/
│  │  ├─ schema.ts
│  │  ├─ schema-version.ts
│  │  ├─ content-validation.ts
│  │  ├─ canonical-json.ts
│  │  ├─ content-hash.ts
│  │  ├─ block-id-extension.ts
│  │  ├─ scope-resolution.ts
│  │  ├─ paste-normalization.ts
│  │  └─ structured-slice.ts
│  ├─ persistence/
│  │  ├─ db.ts
│  │  ├─ schema.ts
│  │  ├─ transaction.ts
│  │  ├─ mappers.ts
│  │  └─ repositories/
│  │     ├─ document-repository.ts
│  │     ├─ revision-repository.ts
│  │     ├─ proposal-repository.ts
│  │     ├─ alternative-repository.ts
│  │     ├─ diff-snapshot-repository.ts
│  │     └─ merge-event-repository.ts
│  ├─ application/
│  │  ├─ contracts/
│  │  ├─ errors.ts
│  │  └─ result.ts
│  ├─ ui/
│  │  ├─ workspace/
│  │  ├─ draft/
│  │  ├─ proposal/
│  │  ├─ review/
│  │  ├─ alternatives/
│  │  ├─ documents/
│  │  └─ primitives/
│  └─ client/
│     ├─ api-client.ts
│     ├─ query-keys.ts
│     ├─ use-draft-autosave.ts
│     ├─ use-alternative-autosave.ts
│     ├─ use-save-barrier.ts
│     └─ workspace-reducer.ts
├─ drizzle/
│  └─ migrations/
├─ tests/
│  ├─ unit/
│  ├─ integration/
│  ├─ component/
│  ├─ e2e/
│  ├─ fixtures/
│  └─ helpers/
├─ data/                  # runtime DB, ignored by version control
├─ drizzle.config.ts
├─ playwright.config.ts
└─ vitest.config.ts
```

Keep route handlers thin: validate, invoke, translate result. They must not contain SQL, diff rules, or ProseMirror merge logic.

## 5. Data model and persistence design

### 5.1 Storage format and global rules

- Store ProseMirror JSON as SQLite `TEXT`; map it to validated typed objects at repository boundaries.
- Store timestamps as UTC ISO-8601 text.
- Use opaque text primary keys.
- Enable `PRAGMA foreign_keys = ON`, WAL journal mode, and a short busy timeout at connection initialization.
- Use `NOT NULL`, foreign keys, and enum `CHECK` constraints wherever SQLite permits.
- Store ordered scope IDs as canonical JSON. Validate uniqueness and order at read and write boundaries.
- Store `schemaVersion`, `generatorVersion`, and `algorithmVersion` explicitly. These versions are part of determinism and history, not display labels.
- Canonical hashes use `SHA-256(version tag + canonical JSON)`.
- Never mutate a completed Proposal, DraftRevision, DiffSnapshot, or MergeEvent.
- Repository update methods should expose only allowed mutable columns, preventing accidental history rewrites.

### 5.2 Tables

#### `documents`

| Column | Notes |
|---|---|
| `id` | Primary key |
| `title` | Non-empty after trim; use a default only at creation |
| `current_content_json` | Full schema-valid ProseMirror document |
| `current_content_hash` | Hash of canonical content |
| `current_version` | Monotonic content-mutation counter |
| `schema_version` | Version used to validate content |
| `created_at`, `updated_at` | UTC timestamps |

`current_version` increments on every actual Canonical Draft content change: direct autosave, Merge, and Revert. A save containing the already-persisted hash is a no-op and does not increment it. Rename does not affect content version, so it does not make an otherwise eligible Revert unavailable.

#### `draft_revisions`

| Column | Notes |
|---|---|
| `id` | Primary key |
| `document_id` | Foreign key to document |
| `parent_revision_id` | Nullable self-reference |
| `content_json`, `content_hash` | Immutable full document |
| `schema_version` | Parser version |
| `cause` | `initial`, `proposal_base`, `merge`, or `revert` |
| `created_at` | UTC timestamp |

Index `(document_id, created_at)` and `(document_id, content_hash)`. Content hashes need not be globally unique. Revert always creates a new revision even when its content hash duplicates an earlier revision.

#### `proposals`

| Column | Notes |
|---|---|
| `id` | Primary key |
| `document_id`, `base_revision_id` | Foreign keys |
| `scope_block_ids_json` | Ordered, unique top-level block IDs |
| `prompt`, `normalized_prompt` | Original for display; normalized for deterministic input |
| `generator_version`, `input_hash` | Determinism/provenance |
| `content_json`, `content_hash` | Nullable for cancelled/failed; immutable when completed |
| `label` | Supported transformation label |
| `status` | `completed`, `cancelled`, or `failed` |
| `created_at`, `completed_at` | `completed_at` only for completed output |

Do not expose update methods for completed rows. A generation computes and validates output first, then inserts the completed Proposal and its Alternative in one transaction. A failed or cancelled request may insert a terminal row with no content. No `pending` row or background job is needed.

#### `alternatives`

| Column | Notes |
|---|---|
| `id` | Primary key |
| `document_id`, `proposal_id` | Foreign keys; one Alternative per completed Proposal in the MVP |
| `parent_alternative_id` | Nullable and always unset in the MVP |
| `content_json`, `content_hash` | Editable structured fragment |
| `content_version` | Monotonic alternative-mutation counter for optimistic saves |
| `is_edited` | False at creation, permanently true after the first content change |
| `created_at`, `updated_at` | UTC timestamps |

Add unique constraint on `proposal_id` for MVP one-to-one creation. Do not add UI or service behavior for `parent_alternative_id`.

#### `diff_snapshots`

| Column | Notes |
|---|---|
| `id` | Primary key |
| `alternative_id`, `base_revision_id` | Foreign keys |
| `base_scope_hash` | Ordered audit hash for the compared blocks |
| `alternative_content_hash` | Entire reviewed Alternative hash |
| `algorithm_version` | Pinned diff behavior |
| `hunks_json` | Complete immutable review model |
| `status` | `current` or `stale` |
| `created_at` | UTC timestamp |

The status is a convenience flag; currentness is always revalidated from hashes. Marking a row stale is allowed metadata mutation, but its comparison inputs and hunks remain immutable.

Each `hunks_json` contains one block review entry for every scoped block, including unchanged blocks. A changed block entry contains one or more text/formatting hunks and any eligible sentence-replacement hunk. Each accepted unit records:

- stable hunk ID;
- target block ID;
- target block type;
- expected target block hash;
- Alternative block or sentence slice hash;
- change classification (`unchanged`, `addition`, `deletion`, `replacement`, `formatting-only`);
- structured before/after slices needed for display and validated merge construction;
- sentence offsets only when acceptance is eligible.

#### `merge_events`

| Column | Notes |
|---|---|
| `id` | Primary key |
| `document_id`, `alternative_id`, `diff_snapshot_id` | Foreign keys |
| `accepted_hunk_ids_json` | Exact accepted unit IDs |
| `before_revision_id`, `after_revision_id` | Foreign keys |
| `target_expectations_json` | Target IDs and expected hashes |
| `acceptance_kind` | `sentence`, `block`, or `section` |
| `document_version_after` | Document content version immediately after Merge |
| `created_at` | UTC timestamp |

`document_version_after` is required to prove that no Canonical Draft transaction followed the Merge. Hash equality alone is insufficient because a user could edit and later recreate the same content hash.

### 5.3 Transaction and concurrency rules

- All content save requests carry `expectedVersion`.
- Direct draft save performs compare-and-swap on `documents.current_version`; conflict returns a typed stale-write response and never overwrites persisted content.
- Alternative save similarly checks `content_version`.
- A successful Merge increments `current_version` once, regardless of the number of accepted blocks.
- A Revert increments `current_version` once.
- Merge and Revert use `BEGIN IMMEDIATE` through the repository transaction helper so their read/validate/write sequence is atomic.
- Generation and diff calculation run outside write transactions. Only final record insertion uses a short transaction.
- A completed Proposal and initial Alternative are inserted atomically.
- The client serializes autosaves per editor; it never permits two in-flight saves for the same entity.

### 5.4 Persistence lifecycle

1. On document creation, insert the Document and its `initial` DraftRevision in one transaction.
2. Direct edits autosave after 750 ms idle and on blur.
3. Alternative edits autosave after 500 ms idle and before switching Alternatives.
4. Generation first crosses a draft save barrier, then creates/reuses a revision matching the persisted current hash.
5. Review first crosses an Alternative save barrier.
6. Merge crosses both barriers, but the server still independently validates all versions and hashes.
7. Refresh/reopen loads only completed persisted saves.

## 6. State management architecture

### 6.1 State ownership

Use three deliberately separate state categories:

1. **Editor state:** Each Tiptap editor instance exclusively owns its ProseMirror `EditorState`, selection, history, and in-memory unsaved content. Never mirror full editor JSON into React global state on every transaction.
2. **Server state:** TanStack Query owns document metadata, persisted content/version, Alternatives list, selected Alternative record, DiffSnapshot, and merge/revert results.
3. **Ephemeral workspace state:** A feature-local reducer/context owns selected document ID, selected Alternative ID, Review/Edit mode, responsive panel mode, open drawer/dialog, generation UI status, selected scope IDs, acknowledgment checkbox, and temporary merged-block highlight IDs.

Do not store Canonical Draft content and Alternative content in one object or reducer. Separate types, query keys, editor refs, and autosave hooks make accidental cross-writing harder.

### 6.2 Autosave controllers

Each editor gets an independent autosave controller with these states:

```text
clean → dirty → saving → clean
                   └→ error
```

Required behavior:

- Coalesce new edits while a save is in flight, then save the newest content once.
- Track the base persisted version for optimistic concurrency.
- Mark a save successful only after the server returns the new version/hash.
- Preserve unsaved JSON in memory on failure and show a persistent, non-modal error.
- Expose `flush(): Promise<Result>` to the save-barrier coordinator.
- Expose `discardUnsaved()` only for the Alternative switching failure path, with explicit user confirmation.
- Do not automatically retry conflicts.

### 6.3 Save barriers

Generation, Review creation, Merge, document switching, Alternative switching, and in-app shutdown/navigation call a shared save barrier. The barrier:

1. prevents new action submission;
2. flushes the relevant editor(s);
3. waits for in-flight saves;
4. proceeds only on confirmed persistence; and
5. focuses and announces the save error otherwise.

Browser/process hard shutdown cannot be guaranteed to wait for asynchronous persistence. See the technical issues section; normal debounce, blur, visibility-change best effort, and in-app barriers are the honest MVP boundary.

### 6.4 Query invalidation rules

- Draft save: update the cached version/hash without replacing the live editor state.
- Alternative save: update cached version/hash, mark existing review unavailable, then request a new review after the save settles and a short debounce.
- Generate: append the new Alternative to chronological history and select it; do not invalidate or refetch My Draft editor content.
- Merge: update Document hash/version/content from the authoritative response, replace My Draft editor content without adding to editor undo history, mark affected review stale, recalculate review, and start temporary highlight.
- Revert: update Document from response without adding to editor undo history; clear eligibility and recalculate any visible review.

Avoid automatic background refetch that overwrites active editor state. Fetch on document open, explicit recovery, and authoritative mutation responses.

## 7. Rich-text editor architecture

### 7.1 One fixed schema

Create exactly one schema factory shared by My Draft, Alternative editing, generator validation, diffing, persistence parsing, and server-side merge transforms.

Allowed top-level block nodes:

- paragraph;
- heading with level 1, 2, or 3;
- bullet list;
- ordered list;
- blockquote.

Allowed inline marks:

- bold;
- italic;
- link with a validated `http`, `https`, or `mailto` destination.

Lists contain their required list-item and paragraph children, but a complete top-level list is one Proposal scope block. A blockquote is also one top-level scope block. Disable code blocks, horizontal rules, hard breaks, strike, underline, images, tables, task lists, comments, arbitrary HTML, and all other extensions.

Every top-level block has a required stable `id` attribute. Nested paragraphs/list items do not need merge-target IDs in the MVP. A ProseMirror append-transaction plugin assigns IDs to newly created My Draft blocks and pasted blocks, rejects duplicate IDs, and preserves existing IDs on ordinary edits.

### 7.2 Schema validation pipeline

All content entering persistence follows the same sequence:

1. parse transport JSON with Zod;
2. parse with the fixed ProseMirror schema;
3. assert all top-level types and attributes are allowed;
4. assert block IDs exist and are unique;
5. normalize deterministic attributes and JSON key order;
6. serialize to canonical JSON;
7. hash the canonical representation.

Generator fragments additionally assert that block count, order, type, and IDs exactly match the Proposal scope.

### 7.3 Paste normalization

Use ProseMirror paste rules/transform hooks, not post-save cleanup:

- parse external HTML/text into the fixed schema;
- drop unsupported nodes and marks;
- retain supported headings, lists, blockquotes, bold, italic, and safe links;
- assign new IDs to top-level pasted blocks;
- strip unsafe link protocols and arbitrary attributes;
- compare the incoming parsed representation with the accepted representation to decide whether to show the non-blocking “formatting was simplified” notice.

Persist only the normalized transaction result. Add fixture tests for HTML from Word, Google Docs, and plain web pages, but do not implement DOCX import.

### 7.4 Scope resolution

Resolve scope from the current ProseMirror selection before generation:

- Cursor: direct top-level child containing `$from`.
- Selection within one block: that full top-level block.
- Cross-block selection: all direct children from the block containing `$from` through the block containing `$to`, inclusive.
- Selection ending exactly at a block boundary should not accidentally include the next block; cover this with explicit position tests.
- Explicit Select All naturally resolves to every top-level block; there is no separate whole-document command.

Store both ordered block IDs and a transient decoration range. The visible scope highlight remains until generation begins, selection changes, or the request is cancelled/failed. Re-resolve IDs after the save barrier and fail if the saved document no longer contains the exact scope.

### 7.5 Editor history and authoritative replacements

- My Draft direct edits use ProseMirror history for session-only undo/redo.
- Alternative editor may use its own session history.
- Applying a merge/revert response to My Draft uses a transaction with `addToHistory: false`.
- Opening another document or Alternative creates/reconfigures the appropriate editor state from persisted content rather than reusing undo history.
- “Revert Merge” is a domain action and never invokes ProseMirror undo.

## 8. Deterministic mock AI provider architecture

### 8.1 Boundary

`ProposalGenerator` is a pure domain interface. Its implementation receives the persisted base revision, ordered scope IDs/content, normalized prompt, and abort signal. It returns a detached structured fragment, label, and generator version. It has no repository or HTTP dependency.

Only `DeterministicMockProposalGenerator` is registered. Provider selection UI, keys, network clients, streaming protocols, and provider tables are not created.

### 8.2 Prompt normalization and action mapping

Use one versioned, deterministic normalization function:

- Unicode normalize;
- trim leading/trailing whitespace;
- collapse internal whitespace;
- case-fold for matching while retaining the original prompt for display.

Exact quick-action values map directly to transformations. Free text maps by a documented, ordered keyword table. First matching transformation wins. No match uses “Rewrite while preserving meaning.” Include normalization rules and mapping-table version in `generatorVersion` or `inputHash`.

`inputHash` covers:

- generator version;
- normalized prompt;
- base revision ID/hash;
- ordered scope block IDs;
- canonical scoped block content.

The hash is provenance, not a cache key: identical requests still create distinct completed Proposal and Alternative records.

### 8.3 Transformation strategy

Implement conservative, rule-based structured-text transforms:

- operate on cloned ProseMirror JSON, never source objects;
- preserve the exact number, order, node type, and ID of top-level scoped blocks;
- retain supported marks unless a deliberate visible transformation changes them;
- use versioned token/phrase dictionaries and deterministic rules;
- never use time, randomness, locale-dependent sorting, external data, or network calls;
- preserve numbers, named tokens, link destinations, and quoted spans;
- use only a small whitelist of non-factual connective phrases for persuasive/expand behavior;
- validate topology and schema after transformation.

The mock is a workflow fixture, not a quality model. Favor obviously deterministic and safe changes over sophisticated rewriting. Snapshot representative outputs per action and property-test determinism/topology.

### 8.4 Request lifecycle

1. Cross the My Draft save barrier.
2. Server loads the persisted Document and verifies requested base revision/scope.
3. Create/reuse a matching base revision.
4. Run generator outside a database write transaction.
5. Optionally render a client-side progressive preview from display-only text.
6. Check abort status.
7. Validate generated structured output and topology.
8. Insert completed Proposal and cloned Alternative atomically.
9. Return both records and select the Alternative.

Cancellation, transformation error, or validation failure never changes the current Proposal Workspace selection/content. Progressive output is never persisted or reviewable. The UI retains the prompt for retry and visibly labels the generator “Demo mode.”

## 9. Diff and review architecture

### 9.1 Comparison inputs

A review is always computed server-side from persisted values:

- the complete immutable base revision used for this review;
- the Proposal’s ordered original target IDs;
- the current persisted Alternative content/hash;
- the pinned diff algorithm version.

Initial review uses the Proposal base revision. “Review against current draft” creates/reuses a revision representing the current Canonical Draft, then compares blocks with the original target IDs. Missing target IDs produce a non-mergeable stale review; no target substitution is offered.

### 9.2 Block alignment

Build maps by stable top-level block ID and then iterate the Proposal’s ordered scope IDs. A review is valid only when every ID exists once in the base and Alternative, appears in the expected order, and retains the expected top-level type.

For each aligned block:

1. hash canonical before and after blocks;
2. compare structural JSON;
3. compare text content;
4. compare mark runs/attributes;
5. classify unchanged, addition, deletion, replacement, or formatting-only;
6. compute sentence eligibility for paragraphs only;
7. compute word highlights strictly for presentation.

“Addition” and “deletion” in the MVP describe inline content added to or removed from a preserved block. The engine does not align added, deleted, reordered, split, or combined top-level blocks.

### 9.3 Sentence segmentation and eligibility

Use a small, versioned, conservative sentence segmenter in the server domain layer. It should recognize terminal punctuation plus following whitespace/end and explicitly treat abbreviations, unusual punctuation, or structurally complex inline content as ambiguous. Do not rely on browser and server `Intl.Segmenter` versions to make acceptance decisions.

Align sentences with an LCS-style comparison over normalized sentence text. Expose a sentence acceptance hunk only when all are true:

- the target is a paragraph;
- source and Alternative top-level block IDs/types match;
- one contiguous changed interval contains exactly one source sentence and one Alternative sentence;
- unchanged neighboring alignment provides unique anchors, or the paragraph contains exactly one sentence on both sides;
- source offsets map exactly to one valid ProseMirror inline slice;
- no top-level or paragraph structure change is involved;
- the replacement preserves a valid paragraph after application.

If any criterion fails, show the difference at block level only. This deliberately favors false negatives over an unsafe sentence merge.

### 9.4 Word and formatting display

- Use word diff only inside a block or eligible sentence hunk.
- Render semantic `<del>`/`<ins>` labels, icons/text, and accessible descriptions; color is supplemental.
- Formatting comparison operates on normalized inline mark runs and link attributes.
- A formatting-only hunk presents before/after formatting samples and is accepted only as part of block or section acceptance.
- Review rendering is a read-only component built from DiffSnapshot data, not an editable editor that could mutate either source.

### 9.5 Alternative edits and review invalidation

On any Alternative transaction:

1. mark the visible review “Updating” immediately;
2. disable all acceptance controls;
3. autosave after 500 ms;
4. mark prior snapshots stale after the save succeeds;
5. calculate a new review;
6. enable only the acceptance units present in the returned current snapshot.

A request ID/generation counter prevents an older review response from replacing a newer one.

### 9.6 Full-section review gate

Open a dedicated dialog or focused view containing every scope block review entry, including unchanged and formatting-only entries. Acceptance is enabled only when:

- the snapshot is current;
- every block entry rendered successfully;
- no original target is missing;
- the user checked “I reviewed all changes in this section.”

The acknowledgment is ephemeral and tied to one DiffSnapshot ID. It resets when the Alternative, snapshot, document, or scope changes. The server verifies `sectionReviewAcknowledged` and that the command represents the entire scope.

## 10. Merge architecture

### 10.1 Client command

The client submits IDs and expectations only:

- document, Alternative, and DiffSnapshot IDs;
- accepted hunk IDs;
- target block IDs with expected hashes;
- acceptance kind;
- section acknowledgment.

It never submits replacement content as authority. The server loads replacement slices from the immutable snapshot and current Alternative.

### 10.2 Server validation

Inside one transaction, `MergeService`:

1. loads Document, Alternative, DiffSnapshot, Proposal, and referenced revisions;
2. validates entity ownership/relationships;
3. validates supported schema and algorithm versions;
4. verifies the snapshot is current;
5. verifies the full Alternative hash equals `alternativeContentHash`;
6. verifies every command hunk exists and matches the requested acceptance kind;
7. verifies each target ID exists exactly once in the current Canonical Draft;
8. verifies each target block hash equals the snapshot/command expectation;
9. verifies sentence eligibility again for sentence acceptance;
10. verifies section command covers every original scope block and has acknowledgment;
11. creates or reuses the immutable pre-Merge revision;
12. applies a ProseMirror transform to a copy;
13. validates the complete result against the fixed schema;
14. creates the post-Merge revision and MergeEvent;
15. compare-and-swap updates Document content/hash/version.

Any failure rolls back. Return typed domain failures (`STALE_TARGET`, `STALE_ALTERNATIVE`, `INVALID_REVIEW`, `INVALID_ACCEPTANCE_UNIT`, or `PERSISTENCE_FAILURE`) without partial mutation.

### 10.3 Unit-specific transforms

- **Sentence:** Replace only the recorded source inline slice in one paragraph with the reviewed Alternative inline slice. Preserve all untouched content and marks byte-for-byte in canonical JSON.
- **Block:** Replace exactly one current top-level block with its reviewed Alternative block. Assert that the stable block ID remains the target ID.
- **Section:** Replace every top-level block in original scope order with the corresponding Alternative block, including unchanged blocks. Assert exact topology and target IDs.

Construct transforms by resolved block ID and validated local offsets, not stale absolute document positions.

### 10.4 Post-merge client behavior

The authoritative response includes content, hash, version, MergeEvent ID, affected block IDs, and Revert eligibility. The client:

- keeps My Draft visible;
- installs authoritative content without adding editor history;
- applies a temporary non-color-only merged-content decoration/announcement;
- leaves the source Alternative selected and available;
- disables acceptance immediately;
- marks affected hunks stale;
- requests a new review before enabling further acceptance;
- shows Revert Merge only while eligible.

## 11. Revision, versioning, and Revert architecture

### 11.1 Revision creation

- Document creation: create `initial`.
- Before generation: reuse a matching revision or create `proposal_base`.
- Before Merge: reuse a matching revision or create the required pre-Merge revision.
- After Merge: always create a new `merge` revision.
- After Revert: always create a new `revert` revision with exact pre-Merge content.

Parent pointers form event ancestry. A newly created revision points to the latest applicable document revision. Reusing an existing hash is allowed where the specification says reuse, but Merge/Revert result revisions are never reused.

### 11.2 Revert eligibility

`revertLatest(documentId, expectedCurrentHash)` loads the latest MergeEvent and succeeds only when:

- `documents.current_version == merge_events.document_version_after`;
- `documents.current_content_hash == expectedCurrentHash`;
- that hash equals the MergeEvent’s after-revision hash; and
- no later Merge or Revert event exists.

This makes any actual direct draft edit, later Merge, or Revert ineligible, even if content later happens to hash identically. A no-op autosave does not invalidate eligibility.

### 11.3 Revert transaction

In one transaction:

1. recheck eligibility;
2. load and validate exact `beforeRevisionId` content;
3. create a new `revert` revision whose parent is the current after-Merge revision;
4. update Document content/hash and increment version;
5. retain every Proposal, Alternative, DiffSnapshot, revision, and MergeEvent.

Do not delete, alter, or mark the original MergeEvent “undone.” The new revision is the audit record.

## 12. UI component hierarchy

```text
AppShell
├─ DocumentSidebar
│  ├─ NewDocumentButton
│  ├─ DocumentList
│  └─ RenameDocumentDialog
├─ DocumentWorkspace
│  ├─ WorkspaceHeader
│  │  ├─ EditableDocumentTitle
│  │  ├─ SaveStatus
│  │  └─ DemoModeBadge
│  ├─ ResponsiveWorkspaceLayout
│  │  ├─ MyDraftPanel
│  │  │  ├─ DraftToolbar
│  │  │  ├─ DraftEditor
│  │  │  ├─ ScopeDecoration
│  │  │  ├─ MergedContentDecoration
│  │  │  └─ DraftSaveError
│  │  └─ ProposalWorkspacePanel
│  │     ├─ ProposalWorkspaceHeader
│  │     │  ├─ AlternativeMetadata
│  │     │  ├─ ReviewModeButton
│  │     │  └─ EditAlternativeButton
│  │     ├─ ReviewMode
│  │     │  ├─ ReviewStatus
│  │     │  ├─ BlockReviewList
│  │     │  │  └─ BlockReviewCard
│  │     │  │     ├─ ChangeTypeLabel
│  │     │  │     ├─ AccessibleDiff
│  │     │  │     ├─ AcceptSentenceButton (eligible only)
│  │     │  │     └─ AcceptBlockButton
│  │     │  ├─ StaleReviewCallout
│  │     │  └─ ReviewAgainstCurrentDraftButton
│  │     └─ EditAlternativeMode
│  │        ├─ AlternativeToolbar
│  │        ├─ AlternativeEditor
│  │        └─ AlternativeSaveStatus/Error
│  ├─ PromptComposer
│  │  ├─ QuickActionGroup
│  │  ├─ PromptInput
│  │  ├─ ScopeSummary
│  │  ├─ GenerateButton
│  │  └─ GenerationStatus/CancelButton
│  ├─ WorkspaceActions
│  │  ├─ OpenSectionReviewButton
│  │  └─ RevertMergeButton (eligible only)
│  ├─ AlternativesDrawer
│  │  └─ AlternativeHistoryItem
│  └─ FullSectionReviewDialog
│     ├─ CompleteBlockReviewList
│     ├─ ReviewAcknowledgmentCheckbox
│     └─ AcceptSectionChangesButton
├─ ToastRegion
└─ LiveAnnouncementRegion
```

On wide screens, render two visibly separated panels with My Draft dominant. On narrower screens, stack or use a focused comparison mode while keeping clear labels and borders/backgrounds. Mobile optimization is excluded; responsive behavior only needs to preserve a usable desktop/tablet-narrow demo.

Keyboard requirements:

- logical tab order between scope, prompt, review, acceptance, history, and revert;
- visible focus indicators;
- editor toolbar controls have names and pressed state;
- drawers/dialogs trap and restore focus correctly;
- change types and save/review status use live regions judiciously;
- all acceptance operations require an explicit button action and are never triggered merely by editor selection.

## 13. Local API contract

Keep endpoints small and resource-oriented:

| Endpoint | Purpose |
|---|---|
| `GET/POST /api/documents` | List/create |
| `GET/PATCH /api/documents/:id` | Open/rename |
| `PUT /api/documents/:id/content` | Optimistic direct autosave |
| `POST /api/proposals/generate` | Generate, validate, persist Proposal + Alternative |
| `GET /api/alternatives/:id` | Load one Alternative and metadata |
| `PUT /api/alternatives/:id/content` | Optimistic Alternative autosave |
| `POST /api/alternatives/:id/review` | Create a DiffSnapshot, optionally against current draft |
| `POST /api/merges` | Validate and atomically apply acceptance |
| `POST /api/documents/:id/revert-latest` | Validate and atomically Revert |

Document-open responses may include chronological Alternatives to avoid a second initial request. Do not add provider, source, template, upload, branch, analytics, export, or background-job routes.

Use a consistent response envelope with typed success data or a stable error code plus safe user message. Map optimistic conflicts/stale reviews to `409`, invalid inputs/acceptance units to `400` or `422`, missing resources to `404`, and unexpected persistence errors to `500`. The UI branches on stable codes, not message strings.

## 14. Milestone breakdown

Each milestone ends in a working, testable slice. Do not begin future-facing work while a listed exit criterion is failing.

### Milestone 0 — Contracts and test harness

Deliver:

- strict TypeScript, lint, formatting, Vitest, and Playwright setup;
- fixed schema/version and canonical JSON/hash utilities;
- domain error/result conventions;
- SQLite connection, migration workflow, and isolated test database helper;
- initial fixture containing every supported block and mark type.

Exit criteria:

- typecheck, lint, unit-test, and empty Playwright smoke test pass;
- equivalent structured JSON always produces the same hash;
- invalid/unsupported structured content fails validation.

### Milestone 1 — Canonical Draft foundation

Deliver:

- document create/list/open/rename;
- My Draft editor with exact supported schema;
- stable top-level block IDs;
- paste normalization and non-blocking notice;
- 750 ms autosave, blur save, optimistic versioning, persistent save errors;
- `initial` revision and refresh/reopen recovery;
- visually separate empty Proposal Workspace.

Exit criteria:

- all supported formatting survives save, refresh, and reopen;
- unsupported pasted structures cannot be persisted;
- save failure preserves in-memory edits and blocks dependent actions;
- direct editor undo/redo works only within the active session.

### Milestone 2 — Proposal and Alternative vertical slice

Deliver:

- deterministic scope resolution and visible scope decoration;
- prompt composer and six quick actions;
- `ProposalGenerator` boundary and mock implementation;
- save barrier before generation;
- generator output/topology validation;
- atomic completed Proposal + Alternative persistence;
- Alternative editor, 500 ms autosave, and edited flag;
- chronological Alternatives drawer;
- cancellation/failure/invalid-output states;
- clear Demo mode indicator.

Exit criteria:

- generation cannot mutate My Draft under success, failure, cancellation, or invalid output;
- same version/prompt/scope input produces identical Proposal content;
- completed Proposal is immutable and Alternative is independently editable;
- selecting/reopening any Alternative does not change My Draft.

At this point the application has the first demonstrable proposal separation slice, but it is not the specification-complete MVP because no acceptance path exists.

### Milestone 3 — Review

Deliver:

- block alignment/classification;
- formatting-only detection;
- conservative sentence segmentation/alignment;
- word-level visual highlights;
- accessible Review renderer;
- DiffSnapshot persistence and algorithm versioning;
- Alternative-edit invalidation and recalculation;
- stale target detection and Review-against-current-draft flow;
- acceptance controls rendered only for valid units, still disabled from mutation until Merge lands.

Exit criteria:

- changed, unchanged, and formatting-only blocks are distinguishable without color;
- sentence acceptance appears only for unambiguous paragraph replacements;
- target deletion stays stale and never relocates;
- unrelated Canonical Draft changes do not invalidate exact target blocks;
- older async review responses cannot replace newer reviews.

### Milestone 4 — Atomic acceptance and Revert

Deliver:

- block and sentence transforms;
- full-section review dialog and acknowledgment gate;
- complete server-side Merge validation;
- transactional pre/post revisions and MergeEvent;
- post-Merge highlight and review recalculation;
- eligible Revert Merge transaction;
- all specified typed failure behavior.

Exit criteria:

- block Merge changes only one reviewed target;
- sentence Merge changes only the reviewed sentence;
- section Merge cannot run before full review load and acknowledgment;
- every stale Alternative/target/snapshot failure is atomic;
- affected hunks remain disabled until recalculation;
- immediate Revert restores the exact pre-Merge hash;
- any later Canonical Draft mutation disables Revert;
- history/provenance records remain immutable.

This is the specification-complete functional MVP.

### Milestone 5 — Completed demo quality pass

Deliver:

- wide, focused-comparison, and narrow stacked layouts;
- all empty/loading/cancel/error/stale states;
- full keyboard workflow and focus management;
- axe-assisted baseline accessibility fixes;
- demo documents and deterministic prompts covering primary scenarios;
- production build/start documentation and database reset instructions;
- performance check on representative long student documents;
- removal of controls or copy outside proposal → review → merge.

Exit criteria:

- every required end-to-end scenario in `PLAN.md` passes;
- production build starts with a fresh migrated local database;
- refresh/reopen recovery is reliable for completed saves;
- no external request, credential, or future-feature placeholder exists;
- typecheck, lint, all test suites, production build, keyboard pass, and accessibility pass succeed.

## 15. Testing strategy

### 15.1 Unit tests

Test pure behavior with no database:

- canonical serialization and hashes;
- schema allowlist and block-ID uniqueness;
- paste normalization fixtures;
- cursor/single-block/cross-block/boundary/Select-All scope resolution;
- prompt normalization/action mapping;
- each mock transformation’s deterministic snapshots;
- topology and factual-token preservation properties;
- block/sentence/word/formatting diff classification;
- ambiguous sentence cases;
- merge command validation;
- ProseMirror sentence/block/section transforms;
- Revert eligibility predicate.

### 15.2 Repository and service integration tests

Use real temporary SQLite files and real migrations:

- document/revision creation;
- optimistic draft and Alternative saves;
- concurrent stale save rejection;
- completed Proposal + Alternative atomic insertion;
- completed Proposal immutability;
- review snapshot persistence/invalidation;
- successful Merge transaction records;
- rollback after each injected validation/persistence failure;
- unrelated block change acceptance;
- missing/changed target rejection;
- stale Alternative and algorithm-version rejection;
- exact post-Merge revision ancestry;
- immediate Revert and every ineligibility condition;
- reload from a new database connection.

Do not mock repositories in the most important Merge tests; transaction behavior is part of the product.

### 15.3 Component tests

Use Testing Library for:

- save/review/generation/error status announcements;
- Review/Edit Alternative mode switching;
- alternatives chronology and edited marker;
- section gate disabled/enabled conditions;
- stale Review callout;
- Revert visibility;
- focus restoration for drawer/dialog;
- change presentation independent of color.

Avoid over-testing Tiptap internals. Test BranchWrite extensions and user-observable behavior.

### 15.4 End-to-end tests

Implement every required scenario from the specification, plus:

- refresh during a dirty-but-not-yet-saved interval recovers only the last completed save;
- generation Cancel leaves the prior Proposal Workspace intact;
- My Draft save failure blocks generate/merge;
- Alternative save failure blocks review/merge/switch;
- two rapid Alternative edits cannot display an obsolete review;
- no-op blur after Merge does not disable Revert;
- real edit after Merge does disable Revert;
- supported link/bold/italic marks survive sentence and block transfers;
- pasted unsupported table/image/HTML attributes do not survive;
- narrow layout retains visible workspace separation.

Use stable data-test IDs only where role/name selectors are insufficient. Keep generation deterministic so E2E expected content is exact.

### 15.5 Accessibility and quality gates

CI/local verification order:

1. typecheck;
2. lint;
3. unit tests;
4. integration tests;
5. production build;
6. Playwright E2E;
7. automated axe scan;
8. manual keyboard smoke test for the required end-to-end flow.

Treat merge/revision tests and production build failures as release blockers. Document any axe exception with rationale; do not silently suppress rules.

## 16. Risks and mitigation

| Risk | Consequence | Mitigation |
|---|---|---|
| Accidental aliasing between Proposal, Alternative, and Draft JSON | Generation/editing could mutate authoritative content in memory | Parse/clone at every boundary, use separate editor instances and types, keep generator pure, and test object/reference isolation. |
| Autosave racing Merge | A delayed save could overwrite accepted content | Per-editor serialized queues, save barriers, server compare-and-swap versions, and transactional Merge version checks. |
| Browser hard close before debounce | Latest keystrokes can be lost | Short debounce, blur/visibility best effort, explicit save state, in-app navigation barriers, and truthful recovery copy. Do not claim hard-close guarantees. |
| Hash instability | False stale reviews or unsafe acceptance | One canonical serializer, explicit schema/version tags, server-only acceptance hashes, and golden cross-process tests. |
| Sentence segmentation ambiguity | Wrong partial replacement | Conservative versioned rules; expose sentence acceptance only with unique one-to-one alignment; always retain block acceptance. |
| Rich marks lost during sentence replacement | Formatting corruption | Store/replace ProseMirror inline slices, not plain strings; round-trip every mark type in unit and E2E tests. |
| Alternative topology edits exceed diff capability | Unreviewable or unsafe merges | Enforce preserved top-level ID/order/type in the Alternative editor for MVP and fail validation closed. See technical issue below. |
| Re-review lacks an immutable comparison base | Snapshot provenance becomes inconsistent | Create/reuse a revision for the current draft before recalculation, using the resolution below. |
| Revert allowed after later edits that recreate the same hash | Later work may be overwritten | Check monotonic `document_version_after` as well as exact hash and latest event. |
| Old async review response wins | Acceptance controls describe stale content | Key requests by Alternative hash/version and ignore/cancel superseded responses. |
| SQLite/native driver packaging | Production build or demo startup fails | Pin Node version, force Node runtime, include a production-build smoke test, and document native dependency install requirements. |
| Long documents cause editor/review lag | Demo feels unreliable | Diff only scoped blocks, debounce review, memoize block review rendering, avoid mirroring editor JSON in React, and test representative document sizes. |
| Mock transformation accidentally changes a factual token | Violates proposal safety constraint | Use conservative token rules, preserve numbers/names/quotes/links, property tests, and versioned golden fixtures. |
| Multi-tab editing | Conflicting local sessions | Optimistic version checks reject stale saves. Do not build collaboration or automatic reconciliation; show a reload/recovery message. |
| Corrupt persisted JSON | App cannot open a document safely | Validate on every repository read, fail with a recoverable error screen, retain the database, and never auto-rewrite invalid history. |

## 17. Specification tensions and explicit resolutions

These are narrow technical clarifications, not product redesigns.

### 17.1 Guaranteed save “before shutdown”

**Issue:** A browser cannot guarantee that an asynchronous localhost request finishes after a tab, browser, or process is forcibly closed. `beforeunload` cannot safely block for an arbitrary database write, and `sendBeacon` does not provide the confirmation required by the specification’s save barrier.

**Recommended MVP resolution:** Guarantee flushes before every in-app transition and dependent operation. Also save after 750/500 ms, on blur, and make a best-effort flush on `visibilitychange/pagehide`. State clearly that hard-close recovery ends at the last completed autosave, which matches the specification’s refresh/reopen limitation.

**Alternative if literal shutdown guarantees are mandatory:** Package the application in a desktop shell with an application-controlled close lifecycle. This materially changes the stack and distribution scope, so it should not be added to this MVP without an explicit specification change.

### 17.2 Re-review against current draft needs a revision

**Issue:** `DiffSnapshot.baseRevisionId` requires an immutable comparison base, but the listed revision triggers do not explicitly create one when “Review against current draft” follows direct autosaves. Pointing to the original Proposal revision would make the snapshot’s provenance false.

**Recommended MVP resolution:** Before re-review, create or reuse a DraftRevision matching the current Canonical Draft and use it as the new snapshot’s `baseRevisionId`. To stay inside the listed enum, record cause `proposal_base`, interpreting it as the immutable base used to review Proposal-originated content. Document this interpretation in the domain model.

**Clearer schema alternative:** Add a `review_base` revision cause. This is semantically cleaner but changes the cause enum in the specification; use it only after product approval.

### 17.3 Editable Alternatives versus topology-limited diff

**Issue:** A normal rich-text editor allows Enter/Backspace/lift/wrap operations that add, delete, split, combine, reorder, or change top-level blocks. The specification simultaneously says Alternatives are editable and says the MVP diff engine does not align those topology changes.

**Recommended MVP resolution:** In Edit Alternative mode, permit text and supported mark edits within existing blocks, but enforce the Proposal’s top-level block count, order, ID, and type. Disable/reject commands that change that topology and provide a non-blocking explanation. This supports the required “edit an Alternative and accept the edited block” workflow without silently implementing out-of-scope structural alignment.

**Alternative:** Allow structural editing but mark the review unsupported and disable acceptance whenever topology changes. This is simpler internally but produces a dead-end user experience, so it is not preferred.

### 17.4 “Preserve factual claims” is not mechanically provable

**Issue:** A deterministic rule-based mock cannot generally prove semantic preservation for arbitrary prose, especially for “Expand,” “Persuasive,” and “Rewrite.”

**Recommended MVP resolution:** Satisfy the constraint by construction: do not introduce numbers, names, sources, citations, quotations, or content-specific assertions; preserve protected factual tokens; use only conservative, versioned phrasing rules; and test representative and generated inputs. Treat the mock as a deterministic workflow demonstration and make no claim of general semantic equivalence.

### 17.5 Failed/cancelled Proposal terminology

**Issue:** The product definition describes a Proposal as immutable successful output, while the persistence model allows failed/cancelled Proposal rows with no reviewable content.

**Recommended MVP resolution:** Treat the `proposals` table as terminal generation records. Only `status = completed` is a product-visible Proposal and can own an Alternative. Failed/cancelled rows remain internal diagnostics and are not shown in the Alternatives drawer. No separate generation-attempt table is needed.

## 18. Engineer handoff checklist

Before calling the demo complete, verify:

- all routes and modules respect the ownership boundaries;
- there is no Canonical Draft mutation path outside direct draft save, Merge, and Revert;
- no completed Proposal update path exists;
- all persisted structured content passes the one fixed schema;
- all acceptance is based on server-loaded snapshots and hashes;
- every required automated and E2E test from `PLAN.md` is present;
- all milestone exit criteria pass on a fresh database and after a production build;
- the UI contains no branch/Git, provider, source, template, upload, export, collaboration, or analytics feature/control;
- documentation describes Demo mode, local database location, startup, reset, test, and known hard-close recovery boundary.

