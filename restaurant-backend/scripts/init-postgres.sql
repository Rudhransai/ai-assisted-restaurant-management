CREATE TABLE IF NOT EXISTS tables (
  id TEXT PRIMARY KEY,
  table_number TEXT NOT NULL,
  capacity INT NOT NULL,
  zone TEXT NOT NULL,
  status TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reservations (
  id TEXT PRIMARY KEY,
  guest_name TEXT NOT NULL,
  party_size INT NOT NULL,
  reservation_time TEXT NOT NULL,
  table_id TEXT NOT NULL,
  status TEXT NOT NULL,
  phone TEXT NOT NULL,
  reminder_sent BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS waitlist (
  id TEXT PRIMARY KEY,
  guest_name TEXT NOT NULL,
  party_size INT NOT NULL,
  phone TEXT NOT NULL,
  position INT NOT NULL,
  quoted_wait_minutes INT NOT NULL,
  status TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  recipient TEXT NOT NULL,
  content TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);
