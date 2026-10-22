ALTER TABLE professionals ADD COLUMN profile_details TEXT NOT NULL DEFAULT '{}';
--> statement-breakpoint
CREATE TABLE chat_messages(id INTEGER PRIMARY KEY AUTOINCREMENT,request_id TEXT NOT NULL REFERENCES requests(id),pro_id INTEGER NOT NULL REFERENCES professionals(id),sender_id TEXT NOT NULL REFERENCES users(id),body TEXT NOT NULL,created TEXT NOT NULL);
--> statement-breakpoint
CREATE INDEX chat_thread ON chat_messages(request_id,pro_id,id);
--> statement-breakpoint
CREATE TABLE chat_reads(request_id TEXT NOT NULL REFERENCES requests(id),pro_id INTEGER NOT NULL REFERENCES professionals(id),user_id TEXT NOT NULL REFERENCES users(id),last_id INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(request_id,pro_id,user_id));
--> statement-breakpoint
CREATE TABLE reviews(request_id TEXT PRIMARY KEY REFERENCES requests(id),pro_id INTEGER NOT NULL REFERENCES professionals(id),client_id TEXT NOT NULL REFERENCES users(id),rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),comment TEXT NOT NULL,created TEXT NOT NULL);
