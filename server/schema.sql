-- Do'ppi PostgreSQL schema

CREATE TABLE IF NOT EXISTS users (
  id BIGINT PRIMARY KEY,
  name TEXT NOT NULL,
  username TEXT NOT NULL,
  email TEXT NOT NULL,
  salt TEXT NOT NULL DEFAULT '',
  hash TEXT NOT NULL DEFAULT '',
  google_id TEXT,
  avatar TEXT NOT NULL DEFAULT '',
  about TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  password_changed_at TIMESTAMPTZ
);
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE
);

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS last_seen BIGINT NOT NULL DEFAULT 0;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS ua TEXT NOT NULL DEFAULT '';
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_logout_at TEXT NOT NULL DEFAULT '';
ALTER TABLE posts ADD COLUMN IF NOT EXISTS seal_until BIGINT;

CREATE TABLE IF NOT EXISTS posts (
  id BIGINT PRIMARY KEY,
  author_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  time TEXT NOT NULL DEFAULT '',
  text TEXT NOT NULL DEFAULT '',
  images JSONB NOT NULL DEFAULT '[]',
  video TEXT,
  live BOOLEAN NOT NULL DEFAULT false,
  seal_until BIGINT
);

CREATE TABLE IF NOT EXISTS post_likes (
  post_id BIGINT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, user_id)
);

CREATE TABLE IF NOT EXISTS post_comments (
  id BIGINT PRIMARY KEY,
  post_id BIGINT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  author_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  time TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS post_shares (
  id SERIAL PRIMARY KEY,
  post_id BIGINT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS seal_shields (
  post_id BIGINT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (post_id, user_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_seal_shields_one ON seal_shields(post_id, user_id);

CREATE TABLE IF NOT EXISTS stories (
  id BIGINT PRIMARY KEY,
  author_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  image TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS story_views (
  story_id BIGINT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (story_id, user_id)
);

CREATE TABLE IF NOT EXISTS reels (
  id BIGINT PRIMARY KEY,
  author_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  image TEXT NOT NULL DEFAULT '',
  caption TEXT NOT NULL DEFAULT '',
  sound TEXT NOT NULL DEFAULT '',
  view_mode TEXT NOT NULL DEFAULT 'none'
);

CREATE TABLE IF NOT EXISTS reel_likes (
  reel_id BIGINT NOT NULL REFERENCES reels(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (reel_id, user_id)
);

CREATE TABLE IF NOT EXISTS reel_comments (
  id BIGINT PRIMARY KEY,
  reel_id BIGINT NOT NULL REFERENCES reels(id) ON DELETE CASCADE,
  author_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  time TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS reel_shares (
  id SERIAL PRIMARY KEY,
  reel_id BIGINT NOT NULL REFERENCES reels(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS albums (
  id BIGINT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  photos JSONB NOT NULL DEFAULT '[]'::jsonb,
  seal_until BIGINT
);

ALTER TABLE albums ADD COLUMN IF NOT EXISTS seal_until BIGINT;

CREATE TABLE IF NOT EXISTS album_likes (
  album_id BIGINT NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (album_id, user_id)
);

CREATE TABLE IF NOT EXISTS threads (
  id BIGINT PRIMARY KEY,
  member_a BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  member_b BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE (member_a, member_b)
);

CREATE TABLE IF NOT EXISTS messages (
  id BIGINT PRIMARY KEY,
  thread_id BIGINT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  sender_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  image TEXT NOT NULL DEFAULT '',
  time TEXT NOT NULL DEFAULT ''
);

ALTER TABLE messages ADD COLUMN IF NOT EXISTS image TEXT NOT NULL DEFAULT '';
ALTER TABLE messages ADD COLUMN IF NOT EXISTS audio TEXT NOT NULL DEFAULT '';
ALTER TABLE messages ADD COLUMN IF NOT EXISTS audio_duration DOUBLE PRECISION;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS seal_until BIGINT;

CREATE TABLE IF NOT EXISTS groups (
  id BIGINT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  cover TEXT NOT NULL DEFAULT '',
  joined BOOLEAN NOT NULL DEFAULT false,
  created_by BIGINT REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS group_members (
  group_id BIGINT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (group_id, user_id)
);

CREATE TABLE IF NOT EXISTS group_messages (
  id BIGINT PRIMARY KEY,
  group_id BIGINT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  sender_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text TEXT NOT NULL DEFAULT '',
  image TEXT NOT NULL DEFAULT '',
  time TEXT NOT NULL DEFAULT ''
);

ALTER TABLE group_messages ADD COLUMN IF NOT EXISTS audio TEXT NOT NULL DEFAULT '';
ALTER TABLE group_messages ADD COLUMN IF NOT EXISTS audio_duration DOUBLE PRECISION;
ALTER TABLE group_messages ADD COLUMN IF NOT EXISTS seal_until BIGINT;

CREATE TABLE IF NOT EXISTS notifications (
  id BIGINT PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'message',
  actor_id BIGINT NOT NULL DEFAULT 0,
  actor_name TEXT NOT NULL DEFAULT '',
  actor_username TEXT NOT NULL DEFAULT '',
  actor_avatar TEXT NOT NULL DEFAULT '',
  thread_id BIGINT,
  group_id BIGINT,
  call_kind TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  has_audio BOOLEAN NOT NULL DEFAULT false,
  has_image BOOLEAN NOT NULL DEFAULT false,
  closed BOOLEAN NOT NULL DEFAULT false,
  read BOOLEAN NOT NULL DEFAULT false,
  created_at BIGINT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, id);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS has_audio BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS has_image BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS closed BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS read BOOLEAN NOT NULL DEFAULT false;

-- Web Push: yopiq brauzerga yetkazish uchun qurilma obunalari
CREATE TABLE IF NOT EXISTS push_subscriptions (
  endpoint TEXT PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  p256dh TEXT NOT NULL DEFAULT '',
  auth TEXT NOT NULL DEFAULT '',
  ua TEXT NOT NULL DEFAULT '',
  created_at BIGINT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_push_subs_user ON push_subscriptions(user_id);

-- VAPID kalitlari va boshqa sozlamalar (kalit qayta ishga tushganda ham saqlanadi)
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
);


CREATE TABLE IF NOT EXISTS group_call_signals (
  id BIGINT PRIMARY KEY,
  group_id BIGINT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  sender_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id BIGINT NOT NULL DEFAULT 0,
  kind TEXT NOT NULL DEFAULT '',
  payload JSONB NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS thread_call_signals (
  id BIGINT PRIMARY KEY,
  thread_id BIGINT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  sender_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id BIGINT NOT NULL DEFAULT 0,
  kind TEXT NOT NULL DEFAULT '',
  payload JSONB NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS follows (
  follower_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  followee_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (follower_id, followee_id)
);

CREATE INDEX IF NOT EXISTS idx_follows_follower ON follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_follows_followee ON follows(followee_id);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_posts_author ON posts(author_id);
CREATE INDEX IF NOT EXISTS idx_comments_post ON post_comments(post_id);
CREATE INDEX IF NOT EXISTS idx_reel_comments ON reel_comments(reel_id);
CREATE INDEX IF NOT EXISTS idx_thread_members ON threads(member_a, member_b);
CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_group_members ON group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_group_messages ON group_messages(group_id);
CREATE INDEX IF NOT EXISTS idx_group_signals ON group_call_signals(group_id, id);
CREATE INDEX IF NOT EXISTS idx_thread_signals ON thread_call_signals(thread_id, id);
CREATE TABLE IF NOT EXISTS doppi_media (
  id text PRIMARY KEY,
  mime text NOT NULL,
  size integer NOT NULL,
  bytes bytea NOT NULL,
  -- Kimga ko'rinishi: 'public' (guruh/omma), 'dm' (suhbat), 'group' (guruh).
  -- 'dm'/'group' da faqat a'zolar ko'radi (server/index.js mediaViewerAllowed).
  scope text NOT NULL DEFAULT 'public',
  ref_id bigint,
  owner_id bigint REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Eski bazalarda jadval `scope` ustunisiz bo'lishi mumkin, shuning uchun
-- AVVAL ustunlarni qo'shamiz, keyin indeks yaratamiz (aks holda
-- `CREATE INDEX ... (scope)` mavjud bo'lmagan ustunga xato beradi).
ALTER TABLE doppi_media ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'public';
ALTER TABLE doppi_media ADD COLUMN IF NOT EXISTS ref_id bigint;
ALTER TABLE doppi_media ADD COLUMN IF NOT EXISTS owner_id bigint REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_media_created ON doppi_media(created_at);
CREATE INDEX IF NOT EXISTS idx_media_scope ON doppi_media(scope);
CREATE INDEX IF NOT EXISTS idx_media_ref ON doppi_media(scope, ref_id);

CREATE TABLE IF NOT EXISTS password_resets (
  username text PRIMARY KEY,
  salt text NOT NULL,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0
);

-- yetkazish sanasi (pochta bombasiga qarshi throttle)
ALTER TABLE password_resets ADD COLUMN IF NOT EXISTS sent_at BIGINT NOT NULL DEFAULT 0;
