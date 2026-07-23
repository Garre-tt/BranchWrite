CREATE TABLE `alternatives` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`proposal_id` text NOT NULL,
	`parent_alternative_id` text,
	`content_json` text NOT NULL,
	`content_hash` text NOT NULL,
	`content_version` integer DEFAULT 0 NOT NULL,
	`is_edited` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`proposal_id`) REFERENCES `proposals`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`parent_alternative_id`) REFERENCES `alternatives`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "alternatives_content_version_nonnegative" CHECK("alternatives"."content_version" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `alternatives_proposal_unique` ON `alternatives` (`proposal_id`);--> statement-breakpoint
CREATE INDEX `alternatives_document_created_idx` ON `alternatives` (`document_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `diff_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`alternative_id` text NOT NULL,
	`base_revision_id` text NOT NULL,
	`base_scope_hash` text NOT NULL,
	`alternative_content_hash` text NOT NULL,
	`algorithm_version` text NOT NULL,
	`hunks_json` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`alternative_id`) REFERENCES `alternatives`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`base_revision_id`) REFERENCES `draft_revisions`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "diff_snapshots_status" CHECK("diff_snapshots"."status" in ('current', 'stale'))
);
--> statement-breakpoint
CREATE INDEX `diff_snapshots_alternative_created_idx` ON `diff_snapshots` (`alternative_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `documents` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`current_content_json` text NOT NULL,
	`current_content_hash` text NOT NULL,
	`current_version` integer DEFAULT 0 NOT NULL,
	`schema_version` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "documents_title_nonempty" CHECK(length(trim("documents"."title")) > 0),
	CONSTRAINT "documents_version_nonnegative" CHECK("documents"."current_version" >= 0)
);
--> statement-breakpoint
CREATE TABLE `draft_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`parent_revision_id` text,
	`content_json` text NOT NULL,
	`content_hash` text NOT NULL,
	`schema_version` text NOT NULL,
	`cause` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`parent_revision_id`) REFERENCES `draft_revisions`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "draft_revisions_cause" CHECK("draft_revisions"."cause" in ('initial', 'proposal_base', 'merge', 'revert'))
);
--> statement-breakpoint
CREATE INDEX `draft_revisions_document_created_idx` ON `draft_revisions` (`document_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `draft_revisions_document_hash_idx` ON `draft_revisions` (`document_id`,`content_hash`);--> statement-breakpoint
CREATE TABLE `merge_events` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`alternative_id` text NOT NULL,
	`diff_snapshot_id` text NOT NULL,
	`accepted_hunk_ids_json` text NOT NULL,
	`before_revision_id` text NOT NULL,
	`after_revision_id` text NOT NULL,
	`target_expectations_json` text NOT NULL,
	`acceptance_kind` text NOT NULL,
	`document_version_after` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`alternative_id`) REFERENCES `alternatives`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`diff_snapshot_id`) REFERENCES `diff_snapshots`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`before_revision_id`) REFERENCES `draft_revisions`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`after_revision_id`) REFERENCES `draft_revisions`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "merge_events_acceptance_kind" CHECK("merge_events"."acceptance_kind" in ('sentence', 'block', 'section')),
	CONSTRAINT "merge_events_document_version_positive" CHECK("merge_events"."document_version_after" > 0)
);
--> statement-breakpoint
CREATE INDEX `merge_events_document_created_idx` ON `merge_events` (`document_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`base_revision_id` text NOT NULL,
	`scope_block_ids_json` text NOT NULL,
	`prompt` text NOT NULL,
	`normalized_prompt` text NOT NULL,
	`generator_version` text NOT NULL,
	`input_hash` text NOT NULL,
	`content_json` text,
	`content_hash` text,
	`label` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	`completed_at` text,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`base_revision_id`) REFERENCES `draft_revisions`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "proposals_status" CHECK("proposals"."status" in ('completed', 'cancelled', 'failed')),
	CONSTRAINT "proposals_terminal_content" CHECK((
        "proposals"."status" = 'completed'
        and "proposals"."content_json" is not null
        and "proposals"."content_hash" is not null
        and "proposals"."completed_at" is not null
      ) or (
        "proposals"."status" in ('cancelled', 'failed')
        and "proposals"."content_json" is null
        and "proposals"."content_hash" is null
        and "proposals"."completed_at" is null
      ))
);
--> statement-breakpoint
CREATE INDEX `proposals_document_created_idx` ON `proposals` (`document_id`,`created_at`);