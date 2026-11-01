-- Email login opt-in. Existing Google sub, sessions, user IDs, credits and orders stay unchanged.
ALTER TABLE users ADD COLUMN email_login_enabled INTEGER NOT NULL DEFAULT 0 CHECK(email_login_enabled IN (0,1));
CREATE TABLE email_login_challenges (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('login', 'enable')),
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT
);
CREATE INDEX idx_email_challenges_email ON email_login_challenges(email, created_at DESC);
CREATE INDEX idx_email_challenges_expire ON email_login_challenges(expires_at);
