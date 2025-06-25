import sqlite3 from 'sqlite3';
import path from 'path';

export function getDatabaseInstance(): sqlite3.Database {
  const dbPath = path.resolve(__dirname, '../../../summarizer.db');
  return new sqlite3.Database(dbPath);
}

export function setupDatabase(db: sqlite3.Database): Promise<void> {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run(`
        CREATE TABLE IF NOT EXISTS documents (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          file_name TEXT,
          chunk_index INTEGER,
          content TEXT
        );
      `);
      db.run(`
        CREATE TABLE IF NOT EXISTS document_vectors (
          embedding TEXT,
          doc_id INTEGER
        );
      `, (err) => {
        if (err) reject(err);
        else {
          resolve();
        }
      });
    });
  });
}
