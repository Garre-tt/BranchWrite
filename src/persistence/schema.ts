import { sql } from "drizzle-orm";
import {
  type AnySQLiteColumn,
  check,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const documents = sqliteTable(
  "documents",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    currentContentJson: text("current_content_json").notNull(),
    currentContentHash: text("current_content_hash").notNull(),
    currentVersion: integer("current_version").notNull().default(0),
    schemaVersion: text("schema_version").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    check("documents_title_nonempty", sql`length(trim(${table.title})) > 0`),
    check("documents_version_nonnegative", sql`${table.currentVersion} >= 0`),
  ],
);

export const draftRevisions = sqliteTable(
  "draft_revisions",
  {
    id: text("id").primaryKey(),
    documentId: text("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    parentRevisionId: text("parent_revision_id").references(
      (): AnySQLiteColumn => draftRevisions.id,
      { onDelete: "restrict" },
    ),
    contentJson: text("content_json").notNull(),
    contentHash: text("content_hash").notNull(),
    schemaVersion: text("schema_version").notNull(),
    cause: text("cause").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    check(
      "draft_revisions_cause",
      sql`${table.cause} in ('initial', 'proposal_base', 'merge', 'revert')`,
    ),
    index("draft_revisions_document_created_idx").on(
      table.documentId,
      table.createdAt,
    ),
    index("draft_revisions_document_hash_idx").on(
      table.documentId,
      table.contentHash,
    ),
  ],
);

export const proposals = sqliteTable(
  "proposals",
  {
    id: text("id").primaryKey(),
    documentId: text("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    baseRevisionId: text("base_revision_id")
      .notNull()
      .references(() => draftRevisions.id, { onDelete: "restrict" }),
    scopeBlockIdsJson: text("scope_block_ids_json").notNull(),
    prompt: text("prompt").notNull(),
    normalizedPrompt: text("normalized_prompt").notNull(),
    generatorVersion: text("generator_version").notNull(),
    inputHash: text("input_hash").notNull(),
    contentJson: text("content_json"),
    contentHash: text("content_hash"),
    label: text("label").notNull(),
    status: text("status").notNull(),
    createdAt: text("created_at").notNull(),
    completedAt: text("completed_at"),
  },
  (table) => [
    check(
      "proposals_status",
      sql`${table.status} in ('completed', 'cancelled', 'failed')`,
    ),
    check(
      "proposals_terminal_content",
      sql`(
        ${table.status} = 'completed'
        and ${table.contentJson} is not null
        and ${table.contentHash} is not null
        and ${table.completedAt} is not null
      ) or (
        ${table.status} in ('cancelled', 'failed')
        and ${table.contentJson} is null
        and ${table.contentHash} is null
        and ${table.completedAt} is null
      )`,
    ),
    index("proposals_document_created_idx").on(
      table.documentId,
      table.createdAt,
    ),
  ],
);

export const alternatives = sqliteTable(
  "alternatives",
  {
    id: text("id").primaryKey(),
    documentId: text("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    proposalId: text("proposal_id")
      .notNull()
      .references(() => proposals.id, { onDelete: "restrict" }),
    parentAlternativeId: text("parent_alternative_id").references(
      (): AnySQLiteColumn => alternatives.id,
      { onDelete: "restrict" },
    ),
    contentJson: text("content_json").notNull(),
    contentHash: text("content_hash").notNull(),
    contentVersion: integer("content_version").notNull().default(0),
    isEdited: integer("is_edited", { mode: "boolean" })
      .notNull()
      .default(false),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    check(
      "alternatives_content_version_nonnegative",
      sql`${table.contentVersion} >= 0`,
    ),
    uniqueIndex("alternatives_proposal_unique").on(table.proposalId),
    index("alternatives_document_created_idx").on(
      table.documentId,
      table.createdAt,
    ),
  ],
);

export const diffSnapshots = sqliteTable(
  "diff_snapshots",
  {
    id: text("id").primaryKey(),
    alternativeId: text("alternative_id")
      .notNull()
      .references(() => alternatives.id, { onDelete: "cascade" }),
    baseRevisionId: text("base_revision_id")
      .notNull()
      .references(() => draftRevisions.id, { onDelete: "restrict" }),
    baseScopeHash: text("base_scope_hash").notNull(),
    alternativeContentHash: text("alternative_content_hash").notNull(),
    algorithmVersion: text("algorithm_version").notNull(),
    hunksJson: text("hunks_json").notNull(),
    status: text("status").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    check(
      "diff_snapshots_status",
      sql`${table.status} in ('current', 'stale')`,
    ),
    index("diff_snapshots_alternative_created_idx").on(
      table.alternativeId,
      table.createdAt,
    ),
  ],
);

export const mergeEvents = sqliteTable(
  "merge_events",
  {
    id: text("id").primaryKey(),
    documentId: text("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "restrict" }),
    alternativeId: text("alternative_id")
      .notNull()
      .references(() => alternatives.id, { onDelete: "restrict" }),
    diffSnapshotId: text("diff_snapshot_id")
      .notNull()
      .references(() => diffSnapshots.id, { onDelete: "restrict" }),
    acceptedHunkIdsJson: text("accepted_hunk_ids_json").notNull(),
    beforeRevisionId: text("before_revision_id")
      .notNull()
      .references(() => draftRevisions.id, { onDelete: "restrict" }),
    afterRevisionId: text("after_revision_id")
      .notNull()
      .references(() => draftRevisions.id, { onDelete: "restrict" }),
    targetExpectationsJson: text("target_expectations_json").notNull(),
    acceptanceKind: text("acceptance_kind").notNull(),
    documentVersionAfter: integer("document_version_after").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    check(
      "merge_events_acceptance_kind",
      sql`${table.acceptanceKind} in ('sentence', 'block', 'section')`,
    ),
    check(
      "merge_events_document_version_positive",
      sql`${table.documentVersionAfter} > 0`,
    ),
    index("merge_events_document_created_idx").on(
      table.documentId,
      table.createdAt,
    ),
  ],
);
