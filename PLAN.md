# BranchWrite MVP Product and Technical Specification

## 1. Product Definition

BranchWrite is a local writing environment where AI-generated writing remains separate from the user’s document until the user accepts it.

The governing thesis is:

> BranchWrite is a writing environment where AI proposes and humans curate, with the user’s draft always remaining the single source of truth.

Every AI contribution requires an explicit human acceptance before entering the canonical draft.

The MVP is an engineering-quality demonstration of the proposal → review → merge workflow. It uses deterministic mock generation and is not intended to validate model quality or product-market demand.

Students are the primary audience. The workflow should also remain credible for professionals working on long documents, but professional, research, source-document, and template-specific features are not part of the MVP.

### Terminology

- **My Draft:** The user-facing editor containing the authoritative document.
- **Canonical Draft:** The persisted structured content underlying My Draft. It is the application’s single source of truth.
- **Proposal Workspace:** The separate surface in which a user views, reviews, and optionally edits generated writing.
- **Proposal:** The immutable output produced by one generation request against a specific Canonical Draft revision and scope.
- **Alternative:** The editable working copy created from a Proposal and displayed in the Proposal Workspace.
- **Review:** The comparison between an Alternative and the Canonical Draft content from which it was generated.
- **Acceptance:** The user action approving one displayed change or a reviewed section.
- **Merge:** The deterministic system operation that applies an accepted change to the Canonical Draft.

The interface may use controls such as **Accept change** and **Accept section changes**. Internally, each acceptance invokes a Merge.

## 2. Product Requirements

### 2.1 Core workflow

1. The user creates or opens a document in My Draft.
2. The user selects one or more complete blocks or places the cursor inside a block.
3. The user enters an instruction or chooses a supported quick action.
4. BranchWrite generates a Proposal without changing My Draft.
5. BranchWrite creates an editable Alternative from the Proposal.
6. The Alternative appears in the Proposal Workspace with a visible Review.
7. The user accepts an individual change or completes the full-section review gate.
8. BranchWrite validates and Merges the accepted content into the Canonical Draft.
9. The user may continue editing the accepted content in My Draft or revert the most recent Merge.

No generation event, Proposal, Alternative edit, or Review operation may modify the Canonical Draft.

### 2.2 Workspace layout

My Draft is the visually dominant surface. The Proposal Workspace remains visibly distinct and may be:

- displayed beside My Draft on sufficiently wide screens;
- displayed in a focused comparison mode; or
- stacked below or above My Draft on narrower screens.

A permanent side-by-side layout is not required. Visual separation between the Proposal Workspace and My Draft is required in every layout.

The default Proposal Workspace mode is Review mode. The user may activate **Edit Alternative** to edit its content. Editing an Alternative never changes its originating Proposal or My Draft.

After a successful Merge:

- My Draft remains in view;
- the merged content receives a temporary visual highlight;
- the source Alternative remains available;
- the Review is recalculated before another change can be accepted; and
- **Revert Merge** is offered when eligible.

### 2.3 Supported document format

Both My Draft and the Proposal Workspace use the same fixed structured-rich-text schema:

- paragraphs;
- headings levels 1–3;
- bullet and ordered lists;
- blockquotes;
- bold;
- italic; and
- links.

The MVP excludes tables, images, comments, footnotes, page layout, arbitrary embedded HTML, tracked changes, and DOCX-specific formatting.

Pasted content is normalized to the supported schema. Unsupported formatting is removed, and the user receives a non-blocking notice.

Formatting supported by the schema must survive Proposal creation, Review, Merge, persistence, refresh, and reopen.

### 2.4 Proposal scope

Generation operates on complete top-level blocks.

- With no selection, the block containing the cursor becomes the scope.
- A selection within one block expands to that complete block.
- A selection spanning multiple blocks expands to the smallest contiguous set of complete blocks containing the selection.
- Before generation, the selected blocks receive a visible scope highlight.
- The user may generate against the entire document by explicitly selecting all blocks. The MVP does not provide a separate whole-document generation mode.

This scope behavior must be deterministic and must not depend on the wording of the prompt.

### 2.5 Deterministic mock generation

The MVP uses one local `DeterministicMockProposalGenerator`. It requires no network connection, credentials, or external provider.

Supported quick actions are:

- Improve clarity
- Make concise
- Make more professional
- Make more persuasive
- Rewrite while preserving meaning
- Expand

The prompt composer also accepts free text:

- Recognized instructions map to one supported transformation.
- Unrecognized instructions use the rewrite transformation.
- The UI clearly identifies generation as demo mode.

For the same generator version, normalized prompt, scope content, and scope order, generation must produce the same Proposal.

The mock generator must:

- preserve the number, order, type, and stable ID of every scoped block;
- preserve factual claims present in the source text;
- avoid introducing named sources, citations, quotations, statistics, or unverifiable factual claims;
- produce content valid under the fixed editor schema; and
- preserve formatting unless the transformation intentionally changes formatting and that change is visible in Review.

Generation may use simulated progressive rendering for demo polish. Progressive text is display-only. A Proposal becomes available only after complete structured output passes schema validation. Cancellation or failure must leave My Draft and the current Proposal Workspace content unchanged.

### 2.6 Proposals and Alternatives

Each successful generation creates:

1. one immutable Proposal containing the original generated result; and
2. one editable Alternative initialized from that Proposal.

The Alternatives drawer displays completed Alternatives chronologically. Each entry shows:

- transformation label;
- original prompt;
- creation time; and
- whether the Alternative has been edited.

Selecting an Alternative loads it into the Proposal Workspace without changing My Draft.

The MVP must not expose:

- branch or Git terminology;
- branch-tree visualization;
- pinning;
- archiving;
- semantic search;
- manual labels; or
- generation from an existing Alternative.

An optional parent Alternative identifier may be retained in the data model as a future extension point, but the MVP neither sets nor exposes it.

### 2.7 Review behavior

Review compares the current Alternative with the Canonical Draft blocks recorded as the Proposal’s original scope.

The default Review operates at block level. Within a changed paragraph, BranchWrite may display sentence-level changes when sentence alignment is unambiguous.

Word-level differences may be highlighted inside a Review hunk for readability. Words and arbitrary phrases are not independent acceptance units.

Review must distinguish additions, deletions, replacements, and formatting-only changes without relying on color alone.

Editing an Alternative invalidates its existing Review. BranchWrite must autosave the Alternative and calculate a new Review before enabling acceptance.

### 2.8 Acceptance and Merge units

The MVP supports three acceptance units:

- **Block acceptance:** Replaces one reviewed top-level block with its corresponding Alternative block.
- **Sentence acceptance:** Replaces one sentence inside a paragraph only when the diff establishes an unambiguous one-to-one sentence replacement.
- **Section acceptance:** Replaces every block in the Proposal’s original scope.

Sentence acceptance must not be shown when alignment is ambiguous, when block structure differs, or when the target is not a paragraph.

The MVP does not support:

- word acceptance;
- phrase acceptance;
- arbitrary-range acceptance;
- drag-and-drop transfer;
- manual destination placement; or
- automatic relocation.

### 2.9 Full-section review gate

Section acceptance requires an explicit review gate:

1. BranchWrite opens a dedicated view containing the complete Review for every block in the scope.
2. Changed, unchanged, and formatting-only blocks are identified.
3. The user selects **I reviewed all changes in this section.**
4. The user activates **Accept section changes**.

The acceptance action remains disabled until the complete Review has loaded successfully and the acknowledgment is selected.

This gate records explicit acceptance. It does not attempt to determine whether the user read each change.

### 2.10 Stale Review handling

BranchWrite must never guess a Merge destination.

Each Review hunk records:

- its target block ID;
- the expected target block hash;
- the Alternative content hash; and
- the Review algorithm version.

Before a Merge:

- each target block must still exist;
- each target block hash must match the expected hash;
- the Alternative content hash must match the reviewed Alternative; and
- the Review snapshot must remain current.

Changes to unrelated blocks do not invalidate an otherwise exact target.

If validation fails:

- the Merge is rejected atomically;
- the Canonical Draft remains unchanged;
- the Alternative remains available;
- the Review is marked stale; and
- the user is offered **Review against current draft**.

Re-review compares the Alternative with the current blocks carrying the original target IDs. If an original target no longer exists, acceptance remains unavailable. BranchWrite does not relocate the content or ask the user to choose another destination.

After a successful sentence or block Merge, BranchWrite invalidates all Review hunks for affected blocks and recalculates the remaining Review before enabling another acceptance.

### 2.11 Undo and Revert

Standard editor undo and redo apply to direct edits made during the active My Draft editing session.

A Merge is reversed through **Revert Merge**, not through persistent editor undo.

Revert Merge is available only when:

- the Merge is the most recent Canonical Draft transaction; and
- the current Canonical Draft hash exactly matches that Merge’s resulting hash.

A Revert:

- creates a new immutable Canonical Draft revision;
- restores the exact pre-Merge content;
- retains the original Proposal, Alternative, and Merge records; and
- never deletes or rewrites history.

If My Draft changes after a Merge, Revert Merge becomes unavailable rather than overwriting later work.

## 3. MVP Boundaries

### Included

- Local document creation, rename, open, and persistence
- Structured-rich-text editing
- Block-scoped deterministic generation
- Proposal validation and persistence
- Editable Alternatives
- Chronological Alternatives history
- Block and eligible sentence Review
- Full-section Review and acceptance
- Atomic Merge validation and persistence
- Safe stale-Review handling
- Immediate eligible Merge reversion
- Formatting-safe transfer
- Refresh and reopen recovery
- Keyboard navigation and baseline accessibility

### Excluded

- Real LLMs and external model providers
- Authentication, accounts, sharing, and collaboration
- Source uploads, retrieval, grounding, citations, and source-related UI
- Templates, template imports, and template-related UI
- Branch-tree UI and branch-management controls
- Semantic history search
- Automatic conflict resolution or target relocation
- Export formats
- Mobile optimization
- Analytics, prompt telemetry, and model-cost tracking
- DOCX/PDF compatibility
- Background workers and remote storage

Future model providers integrate through the Proposal generator boundary. Future sources and templates may extend generation context through separately introduced domain services. The MVP must not include placeholder controls, database tables, upload routes, or background processes for those future capabilities.

## 4. Technical Architecture

### 4.1 Stack

- Next.js
- React
- TypeScript with strict compiler settings
- Tiptap/ProseMirror
- SQLite
- Drizzle ORM
- Zod runtime validation
- Accessible component primitives and design tokens
- Vitest for unit and integration tests
- Playwright for end-to-end tests

The application is local-only and single-user. It has no authentication, external storage, or network dependency.

### 4.2 Architectural boundaries

- My Draft owns the current Canonical Draft content.
- The Proposal Workspace owns only the selected Alternative’s editable content.
- Both editors use the same fixed ProseMirror schema.
- The generator may write only through the Proposal persistence service.
- The Proposal Workspace has no direct Canonical Draft write path.
- The diff engine describes changes but cannot apply them.
- Only the Merge service may create a Canonical Draft revision caused by acceptance.
- Every Merge is validated server-side independently of client state.
- SQLite access is isolated behind repositories so persistence can be replaced without changing editor, generator, diff, or Merge behavior.

### 4.3 Core interfaces

```ts
type ProposalScope = {
  blockIds: string[];
};

type GenerateProposalRequest = {
  documentId: string;
  baseRevisionId: string;
  scope: ProposalScope;
  prompt: string;
};

type ProposalGenerationResult = {
  content: StructuredFragment;
  label: string;
  generatorVersion: string;
};

interface ProposalGenerator {
  generate(
    request: GenerateProposalRequest,
    signal: AbortSignal,
  ): Promise<ProposalGenerationResult>;
}

interface DiffService {
  compare(input: {
    baseRevision: DraftRevision;
    scope: ProposalScope;
    alternativeId: string;
    alternativeContent: StructuredFragment;
  }): DiffSnapshot;
}

type MergeCommand = {
  documentId: string;
  alternativeId: string;
  diffSnapshotId: string;
  hunkIds: string[];
  expectedTargets: Array<{
    blockId: string;
    beforeHash: string;
  }>;
  acceptanceKind: "sentence" | "block" | "section";
  sectionReviewAcknowledged: boolean;
};

type MergeFailure =
  | "STALE_TARGET"
  | "STALE_ALTERNATIVE"
  | "INVALID_REVIEW"
  | "INVALID_ACCEPTANCE_UNIT"
  | "PERSISTENCE_FAILURE";

interface MergeService {
  apply(command: MergeCommand): MergeResult | MergeFailure;
  revertLatest(
    documentId: string,
    expectedCurrentHash: string,
  ): MergeResult | MergeFailure;
}
```

The MVP implements only `DeterministicMockProposalGenerator`. A real provider may implement `ProposalGenerator` later without changing Review or Merge behavior.

### 4.4 Persistence model

#### Document

- `id`
- `title`
- `currentContent`
- `currentContentHash`
- `currentVersion`
- `createdAt`
- `updatedAt`

Direct My Draft edits update `currentContent`, `currentContentHash`, and `currentVersion` after 750 milliseconds of inactivity and on editor blur. Pending autosaves must finish before generation, Review creation, Merge, document switching, or shutdown.

#### DraftRevision

- `id`
- `documentId`
- `parentRevisionId`
- `content`
- `contentHash`
- `cause`: `initial`, `proposal_base`, `merge`, or `revert`
- `createdAt`

A DraftRevision is created:

- when a document is created;
- before generation when no revision matches the current Canonical Draft hash;
- immediately before a Merge when no revision matches the current Canonical Draft hash;
- after every Merge; and
- after every Revert.

Direct autosaves do not create revisions.

#### Proposal

- `id`
- `documentId`
- `baseRevisionId`
- ordered `scopeBlockIds`
- `prompt`
- `generatorVersion`
- `inputHash`
- immutable `content`
- `contentHash`
- `label`
- `status`: `completed`, `cancelled`, or `failed`
- `createdAt`
- `completedAt`

Cancelled and failed records contain no reviewable content.

#### Alternative

- `id`
- `documentId`
- `proposalId`
- nullable `parentAlternativeId`
- editable `content`
- `contentHash`
- `isEdited`
- `createdAt`
- `updatedAt`

The MVP creates one Alternative for each completed Proposal. Alternative edits autosave after 500 milliseconds of inactivity and before switching Alternatives.

#### DiffSnapshot

- `id`
- `alternativeId`
- `baseRevisionId`
- `baseScopeHash`
- `alternativeContentHash`
- `algorithmVersion`
- structured `hunks`
- `createdAt`

A DiffSnapshot is invalidated when:

- Alternative content changes;
- a target block changes;
- a hunk affecting the same block is accepted; or
- the user requests Review against the current draft.

#### MergeEvent

- `id`
- `documentId`
- `alternativeId`
- `diffSnapshotId`
- accepted hunk IDs
- `beforeRevisionId`
- `afterRevisionId`
- target block IDs and expected hashes
- `acceptanceKind`
- `createdAt`

### 4.5 Merge transaction

A Merge executes in one database transaction:

1. Flush pending My Draft and Alternative autosaves.
2. Load the current Document, Alternative, and DiffSnapshot.
3. Validate the Alternative hash and Review version.
4. Validate every target block ID and expected hash.
5. Create or reuse an immutable pre-Merge DraftRevision.
6. Construct the structured editor transaction exclusively from validated Review hunks.
7. Apply the transaction to a copy of the current Canonical Draft.
8. Validate the resulting document against the fixed editor schema.
9. Create the post-Merge DraftRevision and MergeEvent.
10. Update the Document content, hash, and version.

Any failure rolls back the entire transaction and leaves the Canonical Draft unchanged.

### 4.6 Diff rules

The diff engine:

1. normalizes the base scope and Alternative into the fixed schema;
2. aligns blocks by preserved block ID;
3. compares corresponding paragraph text at sentence level;
4. uses word-level comparison only to highlight differences inside a Review hunk;
5. groups adjacent word changes into readable replacements; and
6. records formatting changes separately from text changes.

Because mock generation preserves block topology, the MVP diff engine does not align inserted, removed, reordered, split, or combined blocks.

The diff engine cannot create editor transactions. The Merge service constructs transactions only from validated DiffSnapshot hunks.

### 4.7 Failure behavior

- **Generation cancelled or failed:** My Draft and the current Alternative remain unchanged. The prompt remains available for retry.
- **Invalid generated output:** No completed Proposal or Alternative is created.
- **My Draft save failure:** Preserve unsaved content in memory, display a persistent error, and block generation and Merge until saving succeeds.
- **Alternative save failure:** Preserve unsaved content in memory, display a persistent error, and block Review, Merge, and Alternative switching until saving succeeds or the edit is discarded.
- **Review failure:** Keep My Draft and the Alternative unchanged and offer retry.
- **Merge validation failure:** Keep My Draft unchanged and mark the Review stale.
- **Merge persistence failure:** Roll back the transaction and offer retry.
- **Refresh or reopen:** Restore the most recently completed autosaves. The MVP does not claim recovery of keystrokes entered after the latest autosave.

## 5. Implementation Sequence

1. **Foundation**
   - Establish the fixed editor schema, block IDs, SQLite repositories, document lifecycle, autosave, and recovery.
   - Implement My Draft and the visually separate Proposal Workspace.

2. **Proposal workflow**
   - Implement deterministic generation, schema validation, Proposal persistence, Alternative creation and editing, and the Alternatives drawer.

3. **Review**
   - Implement deterministic block, sentence, word-highlight, and formatting comparisons.
   - Implement stale Review detection and recalculation.

4. **Acceptance and Merge**
   - Implement block and eligible sentence acceptance.
   - Implement the full-section review gate.
   - Implement atomic Merge persistence and eligible Revert Merge.

5. **Quality pass**
   - Complete keyboard flows, accessibility, responsive comparison layouts, empty/error states, demo fixtures, and documentation.
   - Remove any control or behavior that does not directly support proposal → review → Merge.

No future-facing feature may be implemented until all MVP acceptance criteria pass.

## 6. Verification

### Required automated tests

- Generation cannot mutate the Canonical Draft.
- A completed generation creates one immutable Proposal and one editable Alternative.
- Editing an Alternative changes neither its Proposal nor My Draft.
- Selecting or reopening an Alternative never changes My Draft.
- The mock generator is deterministic and preserves scoped block topology.
- A valid block Merge changes only the reviewed target block.
- A valid sentence Merge changes only the reviewed sentence.
- Sentence acceptance is unavailable when alignment is ambiguous.
- Section acceptance is disabled until the complete Review is available and the acknowledgment is selected.
- A stale target, Alternative, or Review causes an atomic failure with no Canonical Draft mutation.
- An unrelated block change does not invalidate an exact target.
- After a Merge, affected Review hunks are invalidated before further acceptance.
- Merge and Revert create immutable revisions and preserve provenance.
- Revert is rejected after any later Canonical Draft change.
- Merge followed immediately by Revert restores the exact pre-Merge content hash.
- Supported structure and formatting survive generation, Review, Merge, persistence, refresh, and reopen.
- Unsupported pasted formatting cannot enter persisted editor content.
- Cancelled, failed, or invalid generation leaves My Draft unchanged.
- Completed autosaves restore My Draft and Alternatives after refresh.

### Required end-to-end scenarios

- A student pastes an essay section, requests improved clarity, reviews the result, accepts one block, and polishes it in My Draft.
- A user creates multiple Alternatives and reopens an earlier one without changing My Draft.
- A user edits an Alternative, receives an updated Review, and accepts the edited block.
- A user changes the target block in My Draft before acceptance and receives a stale Review without relocation.
- A user changes an unrelated block and can still accept an unchanged reviewed target.
- A user completes the full-section review gate, accepts the section, and immediately reverts it.
- A keyboard-only user generates, reviews, accepts, navigates Alternatives, and reverts.
- A document containing all supported block and mark types preserves formatting through the complete workflow.

### Definition of done

The MVP is ready to demonstrate when:

- My Draft is the only authoritative document surface.
- Every Proposal-originated Canonical Draft change results from explicit acceptance.
- Proposal generation, Alternative editing, and Review cannot change the Canonical Draft.
- Block, eligible sentence, and section Merges are deterministic and formatting-safe.
- Stale content fails safely without relocation or guessing.
- Alternatives are understandable without branch or Git concepts.
- The application survives normal refresh and reopen behavior.
- The application passes type checking, linting, automated tests, production build, and baseline keyboard and accessibility checks.
