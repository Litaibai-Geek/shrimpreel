-- Simple email/password authentication (when email.loginEnabled=false in site.setup.json)
-- Password is hashed with bcrypt-like algorithm; one IP can register one account only.

-- Add password hash column to users table
ALTER TABLE users ADD COLUMN password_hash TEXT;

-- IP registration tracking table
CREATE TABLE ip_registrations (
  ip_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  registered_at TEXT NOT NULL
);

CREATE INDEX idx_ip_registrations_user ON ip_registrations(user_id);
