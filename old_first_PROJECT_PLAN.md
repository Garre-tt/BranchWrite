# BranchWrite Project Plan

## 1. Product Definition

BranchWrite is an AI-first writing workspace built around one hard guarantee:

> AI-generated text never changes the user's canonical draft without an explicit merge action.

The product has two persistent surfaces:

- **AI Workspace (left):** disposable, branchable experiments generated from prompts.
- **My Draft (right):** the authoritative document, edited only by the user or through explicit merge actions.

The core loop is:

1. Write or select text in **My Draft**.
2. Ask the AI to transform, expand, critique, or replace it.
3. Review the result and its diff in **AI Workspace**.
4. Merge a word, phrase, sentence, paragraph, selection, or full result.
5. Undo if needed, while retaining the AI result as a recoverable branch.

## 2. Product Principles

1. **The canonical draft is protected.** No prompt may mutate it.
2. **Every AI result is recoverable.** A generation is an immutable version node.
3. **Merging is explicit and reversible.** Each merge is a transaction with undo.
4. **The simple path stays visible.** Advanced history and branch tools remain progressive disclosures.
5. **Users work with documents, not Git concepts.** Internally the product may use branches and patches; the interface should say “versions,” “ideas,” and “merge.”
6. **AI output is untrusted input.** Model output must not directly execute editor operations.

## 3. Target User and Initial Use Case

### Primary user

A student, researcher, professional, or long-form writer who has an existing draft and wants to explore AI revisions without losing control of the original.

### MVP use case

A user writes or pastes a document, selects a paragraph, requests “make this more persuasive,” reviews a sentence-level diff, merges two sentences, and can undo both changes. The generated alternative remains available in history.

### Jobs to be done

- “Let me explore a risky rewrite without damaging my draft.”
- “Let me take only the useful parts of an AI response.”
- “Help me remember why a version existed.”
- “Let me recover an idea from an earlier experiment.”

## 4. Scope

### MVP: prove the protected-draft merge loop

- Create, rename, open, and save a document.
- Side-by-side rich-text or structured-text editors.
- User selection and prompt composer.
- AI generation into a separate workspace.
- Streaming generation with cancel and retry.
- Word- and sentence-level diff visualization.
- Merge sentence, paragraph, selection, or full result.
- Deterministic merge target and insertion preview.
- Undo/redo for draft edits and merges.
- Linear semantic history of AI generations.
- Automatic event labels derived from prompts.
- Autosave and crash recovery.
- Basic authentication and per-user document isolation.
- Minimal model usage and error telemetry.

### Beta: add real branching and grounding

- Branch tree with parent/child generation relationships.
- Generate again from any previous AI result.
- Pin, rename, archive, and compare branches.
- Semantic search over version labels, prompts, and content.
- Upload and parse PDF, DOCX, TXT, and Markdown sources.
- Attach selected sources to a generation.
- Citations tied to source spans.
- Consistency checks after merging old content.
- Export to DOCX, PDF, Markdown, and plain text.

### Later

- Multi-user collaboration, comments, and permissions.
- Track-changes import/export.
- Organization workspaces and admin controls.
- Full-document structural planning.
- Custom style guides and reusable prompt recipes.
- Sentence-level provenance or influence visualization.
- Mobile editing.
- Offline-first synchronization.

### Explicitly out of MVP

- Real-time collaboration.
- Arbitrary word-by-word drag animation.
- Perfect automatic merge-conflict resolution.
- Citation guarantees without source verification.
- Complex page-layout parity with Microsoft Word.
- Plugin marketplace or agent autonomy.

## 5. MVP Experience

### First-run flow

1. User creates a document or pastes text.
2. A short coach mark explains: “AI works on the left. Your draft on the right changes only when you merge.”
3. User selects text or leaves the selection empty for whole-document context.
4. User enters a prompt.
5. AI Workspace shows the result and highlights changes.
6. Hovering a change shows **Merge**; clicking previews its destination.
7. The merge is applied to My Draft and a toast offers **Undo**.

### Prompt context rules

- If text is selected, the default operation is scoped to that selection.
- If the cursor is in a paragraph, the UI offers the paragraph as an optional scope.
- If nothing is selected, the AI receives the document plus explicit instructions about whether to return a full alternative or an insertion.
- The prompt request stores the exact draft revision and selection used as its base.
- If the draft changes while generation is running, the result remains bound to the earlier revision and is marked accordingly.

### Merge rules

- Each generated result references a specific base draft revision and source range.
- Merge actions are computed patches, never free-form model commands.
- Before applying a patch, the client/server verifies that the target still matches its expected base.
- If the target has changed, show a preview and ask the user to choose a destination or regenerate the diff.
- Every accepted patch creates a new draft revision and an undoable merge event.

## 6. Information Architecture

- **Home**
  - Recent documents
  - New document
  - Search
- **Document Workspace**
  - AI Workspace
  - My Draft
  - Prompt composer
  - Version/history drawer
  - Sources drawer (Beta)
  - Document menu/export
- **Settings**
  - Account
  - AI/model preferences
  - Data retention and deletion

## 7. Technical Architecture

### Recommended initial stack

- **Web application:** Next.js with TypeScript.
- **Editor:** ProseMirror-based editor such as Tiptap.
- **UI:** React, accessible component primitives, and a small design-token system.
- **Backend:** Next.js server routes for the MVP, split into services only when scale requires it.
- **Database:** PostgreSQL.
- **ORM:** Drizzle or Prisma.
- **Authentication:** managed OAuth/email provider.
- **File storage:** S3-compatible object storage.
- **AI gateway:** server-side provider adapter with streaming, structured request logs, retries, and model configuration.
- **Background work:** job queue for parsing, embeddings, consistency checks, and exports.
- **Observability:** product analytics, error tracking, and model latency/cost metrics with redacted content by default.

### Core components

1. **Draft editor**
   - Owns the canonical document state.
   - Emits immutable revisions.
   - Supports transactions and undo/redo.
2. **AI workspace**
   - Renders generated structured content.
   - Never receives write access to the canonical draft.
3. **Generation service**
   - Builds context, calls the model, validates output, and persists a generation node.
4. **Diff engine**
   - Produces stable block-, sentence-, and word-level changes.
   - Maps generated changes back to the base revision.
5. **Merge engine**
   - Converts accepted changes into validated editor transactions.
   - Detects stale targets and records provenance.
6. **Version graph**
   - Stores immutable generation nodes and mutable presentation metadata.
7. **Search and retrieval** (Beta)
   - Hybrid metadata, full-text, and semantic search.
8. **Source ingestion** (Beta)
   - Parses uploads into source documents and addressable chunks.

### Important architectural boundary

The model may return text plus structured intent, but it must never return an executable editor transaction. Only the deterministic merge engine can create a draft mutation.

## 8. Data Model

### Core entities

**User**

- `id`
- account/profile fields
- preferences

**Document**

- `id`, `owner_id`
- `title`
- `current_revision_id`
- timestamps and archive state

**DraftRevision**

- `id`, `document_id`
- `parent_revision_id`
- structured editor content
- plain-text search representation
- content hash
- author type (`user`, `merge`, `system`)
- timestamp

**Generation**

- `id`, `document_id`
- `parent_generation_id` (nullable for MVP, active in Beta)
- `base_revision_id`
- selected source range/anchors
- prompt and normalized operation
- generated structured content
- status, model, latency, and token metadata
- semantic label
- timestamps

**Diff**

- `id`, `generation_id`
- diff algorithm version
- base and result hashes
- structured change hunks

**MergeEvent**

- `id`, `document_id`
- `generation_id`, `diff_hunk_id`
- `before_revision_id`, `after_revision_id`
- accepted range/content and destination anchors
- timestamp

**SourceDocument** (Beta)

- `id`, `document_id`, uploader
- filename, type, storage key, parse status
- extracted metadata

**SourceChunk** (Beta)

- `id`, `source_document_id`
- text, page/section location
- embedding reference

### Storage strategy

Store immutable full snapshots first. They are simpler to reason about and restore during the MVP. Add delta compression only after real storage measurements justify it.

## 9. Diff and Merge Design

### Diff pipeline

1. Normalize editor content into blocks while preserving stable node IDs.
2. Match blocks using IDs, similarity, and order.
3. Perform sentence diff inside changed blocks.
4. Perform word diff inside changed sentences.
5. Group tiny adjacent changes into human-readable hunks.
6. Render additions, deletions, and replacements with accessible non-color indicators.

### Merge granularity

Ship paragraph, sentence, selected range, and full result first. Word- and phrase-level acceptance can be shown experimentally, but should not block MVP launch because fragmented merges create ambiguous grammar and cursor-mapping problems.

### Stale-result handling

If the canonical draft has changed since generation:

- Attempt deterministic anchor relocation using surrounding text and node IDs.
- If confidence is high, show the relocated preview.
- If confidence is low, require destination selection.
- Never silently overwrite or discard current draft text.

## 10. AI System Design

### Generation contract

Input:

- user instruction
- selected content and scope
- relevant surrounding context
- optional full-document summary
- optional attached source excerpts
- explicit instruction to return alternate content, not edit commands

Output:

- generated content in a constrained document schema
- short semantic label
- optional notes/warnings
- citations only when grounded source spans are present

### Context management

- Preserve the exact input bundle for reproducibility.
- Use selection-first context to control cost and latency.
- Summarize distant document context as documents grow.
- Never claim a citation or source relationship that cannot be resolved to an ingested source span.

### Version retrieval (Beta)

Use layered retrieval:

1. filters for document, date, branch, and event type;
2. full-text search across prompts and labels;
3. semantic search across prompts, labels, and generated content;
4. reranking with current user intent.

“Return to what we were working on” should use an explicit workspace navigation stack, not rely on model memory.

## 11. Security, Privacy, and Reliability

- Encrypt traffic and stored document/source data.
- Enforce authorization at every document, revision, generation, and source query.
- Keep model credentials server-side.
- Provide data export and permanent deletion.
- Define retention rules for prompts, outputs, and provider logs.
- Redact document content from general application logs.
- Autosave locally during transient network failures.
- Use idempotency keys for generation and merge requests.
- Test recovery from interrupted streaming and failed saves.
- Add abuse limits, upload scanning, and file-size/type restrictions.
- Treat uploaded documents and retrieved text as untrusted content against prompt injection.

## 12. Delivery Roadmap

Assumption: a small team of two product engineers plus part-time design/product support. Calendar estimates should be recalibrated after the first technical spike.

### Phase 0 — Validation and technical spikes (2 weeks)

- Interview 6–10 target writers.
- Prototype the two-pane interaction at high fidelity.
- Test sentence/paragraph merge comprehension.
- Spike Tiptap/ProseMirror anchoring and undo behavior.
- Compare diff libraries on real prose.
- Define MVP analytics and baseline tasks.

**Exit criteria:** users understand which pane is authoritative; the team can reliably map a generated sentence back to a selected base range.

### Phase 1 — Editor foundation (2–3 weeks)

- Application shell and authentication.
- Document CRUD.
- Canonical editor with autosave.
- Immutable revisions and crash recovery.
- AI workspace shell and prompt composer.
- Accessibility foundations and keyboard navigation.

**Exit criteria:** a user can safely create, edit, reload, and recover a document.

### Phase 2 — AI generation loop (2 weeks)

- Provider adapter and server-side streaming.
- Selection-aware prompt context.
- Cancel, retry, timeout, and error states.
- Persist generations and semantic event labels.
- Cost, latency, and failure telemetry.

**Exit criteria:** every prompt creates a stored alternative without mutating My Draft.

### Phase 3 — Diff and merge MVP (3–4 weeks)

- Block/sentence/word diff pipeline.
- Hunk rendering and merge controls.
- Deterministic merge engine.
- Stale-result conflict flow.
- Merge provenance and undo/redo.
- Full regression and property-based merge tests.

**Exit criteria:** no tested generation path can mutate the draft without an explicit merge; merges are reversible and do not lose unrelated content.

### Phase 4 — Private alpha (2 weeks)

- Linear semantic history.
- Rename, pin, reopen, and delete/archive generations.
- Onboarding and empty/error states.
- Export to Markdown/plain text.
- Security review, backups, and operational dashboards.
- Alpha with 10–20 writers.

**Exit criteria:** at least 80% of test users complete generate-review-partial-merge-undo without help; no data-loss severity-one bugs.

### Phase 5 — Beta branching and sources (4–6 weeks)

- Branch graph and branch-from-generation.
- Semantic version search and navigation stack.
- Source upload/parsing and grounded generation.
- Citation links.
- Merge consistency checks.
- DOCX/PDF export.

**Exit criteria:** users can recover a named past idea and merge it safely into a newer draft; source-backed output resolves to valid source locations.

## 13. Workstreams and Initial Backlog

### Product and design

- Define selection, prompt, generation, diff, merge, conflict, and undo states.
- Prototype keyboard and mouse flows.
- Establish language that avoids developer-centric Git terminology.
- Test progressive disclosure of history and branches.

### Editor platform

- Select schema and editor framework.
- Implement stable node IDs and selection anchors.
- Build revision serialization and migration strategy.
- Build autosave, offline buffer, and recovery.

### AI platform

- Define provider-neutral interface.
- Build prompt/context assembly.
- Validate structured model output.
- Add streaming lifecycle and cancellation.
- Add model evaluation fixtures.

### Diff and merge

- Assemble a prose-diff test corpus.
- Implement hierarchical diff.
- Define hunk grouping heuristics.
- Implement transaction validation, conflict detection, and undo.

### Backend and data

- Implement document/revision/generation APIs.
- Add authorization policy tests.
- Add idempotency and optimistic concurrency.
- Add backups and deletion/export workflows.

### Quality

- Unit tests for normalization, anchors, and diff.
- Property tests asserting no unrelated content loss.
- Integration tests for concurrent edits and stale generations.
- End-to-end tests for the primary loop.
- Accessibility and keyboard-only tests.

## 14. Testing Strategy

### Highest-risk test invariants

- A model response alone can never update a draft revision.
- Applying and undoing a merge restores the identical content hash.
- A merge never deletes content outside its displayed preview.
- A stale merge never applies silently.
- Refreshing during generation or merge does not corrupt either workspace.
- Reopening any history entry displays the exact stored generation.

### Evaluation set

Create 100–200 representative prose transformations:

- shortening and expansion;
- sentence reordering;
- paragraph splitting/combining;
- punctuation-only edits;
- list and heading changes;
- Unicode and non-English text;
- citations and footnotes;
- simultaneous user edits;
- empty and very large selections.

Measure diff readability, target accuracy, merge correctness, latency, and user preference—not only model output quality.

## 15. Success Metrics

### North-star behavior

**Useful merge rate:** percentage of generation sessions in which the user merges at least one change and retains it after 24 hours.

### Activation

- First generation completed.
- First partial merge completed.
- Time to first useful merge.
- Percentage completing generate → merge → undo in onboarding.

### Trust and quality

- Undo rate after merge.
- Stale/conflicted merge rate.
- Data-loss or unintended-mutation incidents (target: zero).
- User-reported feeling of control.
- Diff comprehension success in usability tests.

### Retention and value

- Weekly documents with AI generations.
- Generations per active document.
- Reopened historical generations.
- Past branches reused in current drafts.

### Operational

- Generation first-token and completion latency.
- Generation error/cancel rate.
- Autosave success and recovery rate.
- Model cost per useful merge.

## 16. Key Risks and Mitigations

| Risk | Why it matters | Mitigation |
|---|---|---|
| Fine-grained merge is ambiguous | Word-level acceptance can produce broken prose or unclear destinations | Launch sentence/paragraph merge first; add smaller units after testing |
| Draft changes after generation | Diffs and positions become stale | Bind every generation to a revision; validate anchors before merge |
| Branch UI overwhelms beginners | The differentiator can become complexity | Keep history in a drawer; reveal the graph only on demand |
| Rich-text diff is fragile | Formatting and structure complicate text diff | Use schema-aware hierarchical diff and stable node IDs |
| Semantic search returns the wrong version | Users may lose trust in history | Combine metadata, full text, semantic retrieval, and previews |
| Source provenance is overstated | “Influenced by” is hard to prove | Distinguish retrieved evidence from inferred influence |
| AI cost grows with long documents | Full context is slow and expensive | Selection-first context, summaries, caching, and usage limits |
| AI provider outage | Core generation becomes unavailable | Clear recovery states, saved prompts, retry, and provider abstraction |

## 17. Decisions to Make Before Implementation

1. Is the first release plain/Markdown-like structured text or full rich text?
2. Is the primary market students/researchers, professional writers, or general knowledge workers?
3. Which export format is mandatory for the first real users?
4. What content retention promise will be made, and may providers train on or retain content?
5. Will one generation return a replacement selection, a full alternate document, or both?
6. What is the smallest merge unit that usability tests show users can understand reliably?
7. Is the product single-player until product-market fit, or is collaboration essential to the wedge?

## 18. Recommended First Milestone

Build a narrow, local-data prototype containing:

- one document;
- two Tiptap editors;
- selection-scoped AI generation;
- immutable saved AI results;
- sentence/paragraph diff;
- explicit merge preview;
- undo.

Test this with five real writing tasks before building authentication, uploads, semantic search, or collaboration. If users do not understand and trust the merge interaction, the rest of the roadmap will not rescue the product.

## 19. MVP Definition of Done

The MVP is ready for private alpha when:

- The authoritative draft cannot be mutated through any AI generation code path.
- Users can generate from a selection and review an understandable diff.
- Sentence, paragraph, selection, and full-result merges are deterministic.
- Every merge is previewed, logged, and reversible.
- Generations and draft revisions survive refreshes and interrupted sessions.
- Stale generations trigger a safe conflict flow.
- Core flows work by keyboard and meet baseline accessibility checks.
- Authorization, deletion, backup, and recovery paths have been tested.
- Product analytics can measure activation, useful merges, errors, and latency.
