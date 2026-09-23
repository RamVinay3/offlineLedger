export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS people (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone_number TEXT,
  email TEXT,
  notes TEXT,
  is_archived INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_people_name ON people(name);
CREATE INDEX IF NOT EXISTS idx_people_archived ON people(is_archived);

CREATE TABLE IF NOT EXISTS obligations (
  id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL,
  type TEXT NOT NULL,
  direction TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  amount REAL DEFAULT 0,
  currency TEXT DEFAULT '₹',
  status TEXT NOT NULL,
  due_date TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_obligations_person ON obligations(person_id);
CREATE INDEX IF NOT EXISTS idx_obligations_status ON obligations(status);
CREATE INDEX IF NOT EXISTS idx_obligations_type ON obligations(type);
CREATE INDEX IF NOT EXISTS idx_obligations_due_date ON obligations(due_date);
CREATE INDEX IF NOT EXISTS idx_obligations_direction ON obligations(direction);

CREATE TABLE IF NOT EXISTS money_transactions (
  id TEXT PRIMARY KEY,
  obligation_id TEXT NOT NULL,
  original_amount REAL NOT NULL,
  remaining_amount REAL NOT NULL,
  currency TEXT DEFAULT '₹',
  created_at TEXT NOT NULL,
  FOREIGN KEY (obligation_id) REFERENCES obligations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_money_obligation ON money_transactions(obligation_id);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  obligation_id TEXT NOT NULL,
  person_id TEXT NOT NULL,
  amount REAL NOT NULL,
  notes TEXT,
  payment_date TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (obligation_id) REFERENCES obligations(id) ON DELETE CASCADE,
  FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_payments_obligation ON payments(obligation_id);
CREATE INDEX IF NOT EXISTS idx_payments_person ON payments(person_id);

CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY,
  obligation_id TEXT NOT NULL,
  person_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  borrowed_at TEXT NOT NULL,
  expected_return_date TEXT,
  returned_at TEXT,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (obligation_id) REFERENCES obligations(id) ON DELETE CASCADE,
  FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_items_obligation ON items(obligation_id);
CREATE INDEX IF NOT EXISTS idx_items_person ON items(person_id);
CREATE INDEX IF NOT EXISTS idx_items_status ON items(status);

CREATE TABLE IF NOT EXISTS commitments (
  id TEXT PRIMARY KEY,
  obligation_id TEXT NOT NULL,
  person_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  due_date TEXT,
  status TEXT NOT NULL,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (obligation_id) REFERENCES obligations(id) ON DELETE CASCADE,
  FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_commitments_obligation ON commitments(obligation_id);
CREATE INDEX IF NOT EXISTS idx_commitments_person ON commitments(person_id);

CREATE TABLE IF NOT EXISTS settlements (
  id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL,
  settled_amount REAL NOT NULL,
  direction TEXT NOT NULL,
  notes TEXT,
  settled_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_settlements_person ON settlements(person_id);

CREATE TABLE IF NOT EXISTS reminders (
  id TEXT PRIMARY KEY,
  obligation_id TEXT NOT NULL,
  person_id TEXT NOT NULL,
  reminder_type TEXT NOT NULL,
  reminder_date TEXT NOT NULL,
  is_notified INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  FOREIGN KEY (obligation_id) REFERENCES obligations(id) ON DELETE CASCADE,
  FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_reminders_obligation ON reminders(obligation_id);
CREATE INDEX IF NOT EXISTS idx_reminders_date ON reminders(reminder_date);

CREATE TABLE IF NOT EXISTS activities (
  id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL,
  obligation_id TEXT,
  event_type TEXT NOT NULL,
  description TEXT NOT NULL,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_activities_person ON activities(person_id);
CREATE INDEX IF NOT EXISTS idx_activities_created_at ON activities(created_at);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;
