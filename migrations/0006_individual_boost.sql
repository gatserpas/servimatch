ALTER TABLE users ADD COLUMN boost_until TEXT;
--> statement-breakpoint
ALTER TABLE users ADD COLUMN boost_service TEXT NOT NULL DEFAULT '';
