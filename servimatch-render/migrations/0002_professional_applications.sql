ALTER TABLE professionals ADD COLUMN approval_status TEXT NOT NULL DEFAULT 'approved';
--> statement-breakpoint
ALTER TABLE professionals ADD COLUMN zone TEXT NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE professionals ADD COLUMN experience TEXT NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE professionals ADD COLUMN review_note TEXT NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE professionals ADD COLUMN reviewed_at TEXT;
--> statement-breakpoint
ALTER TABLE professionals ADD COLUMN reviewed_by TEXT REFERENCES users(id);
--> statement-breakpoint
ALTER TABLE professionals ADD COLUMN application_version INTEGER NOT NULL DEFAULT 1;
