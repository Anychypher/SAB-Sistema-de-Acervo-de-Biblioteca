const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const dir = path.join(__dirname, '..', 'data');
fs.mkdirSync(dir, { recursive: true });
const db = new Database(path.join(dir, 'sab.sqlite'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(`
CREATE TABLE IF NOT EXISTS books (
 id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL UNIQUE, author TEXT NOT NULL, title TEXT NOT NULL,
 publisher TEXT NOT NULL DEFAULT '', section TEXT NOT NULL DEFAULT '', category TEXT NOT NULL DEFAULT '',
 total INTEGER NOT NULL CHECK(total BETWEEN 1 AND 99), available INTEGER NOT NULL CHECK(available BETWEEN 0 AND 99),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS students (
 id INTEGER PRIMARY KEY AUTOINCREMENT, enrollment TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
 birth TEXT NOT NULL DEFAULT '', class_name TEXT NOT NULL DEFAULT '', street TEXT NOT NULL DEFAULT '',
 number TEXT NOT NULL DEFAULT '', complement TEXT NOT NULL DEFAULT '', neighborhood TEXT NOT NULL DEFAULT '',
 city TEXT NOT NULL DEFAULT '', father TEXT NOT NULL DEFAULT '', father_phone TEXT NOT NULL DEFAULT '',
 mother TEXT NOT NULL DEFAULT '', mother_phone TEXT NOT NULL DEFAULT '', guardian TEXT NOT NULL DEFAULT '',
 guardian_phone TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS loans (
 id INTEGER PRIMARY KEY AUTOINCREMENT, student_id INTEGER NOT NULL REFERENCES students(id),
 book_id INTEGER NOT NULL REFERENCES books(id), borrowed_at TEXT NOT NULL, due_at TEXT NOT NULL,
 renewed_at TEXT, renewed_due_at TEXT, returned_at TEXT, status TEXT NOT NULL DEFAULT 'active',
 FOREIGN KEY(student_id) REFERENCES students(id), FOREIGN KEY(book_id) REFERENCES books(id)
);
CREATE INDEX IF NOT EXISTS idx_loans_student_status ON loans(student_id, status);
CREATE INDEX IF NOT EXISTS idx_loans_due ON loans(due_at, status);
`);
module.exports = db;
