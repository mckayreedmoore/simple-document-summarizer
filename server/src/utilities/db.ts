import sqlite3 from 'sqlite3';
import path from 'path';

export function getDatabaseInstance(): sqlite3.Database {
  const dbPath = path.resolve(__dirname, '../../../summarizer.db');
  return new sqlite3.Database(dbPath);
}

export function setupDatabase(db: sqlite3.Database): Promise<void> {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run('PRAGMA foreign_keys = ON;');
      db.run(`
        CREATE TABLE IF NOT EXISTS DocumentChunks (
          chunkId INTEGER PRIMARY KEY AUTOINCREMENT,
          fileName TEXT,
          chunkIndex INTEGER,
          content TEXT
        );
      `);
      db.run(
        `
        CREATE TABLE IF NOT EXISTS DocumentVectors (
          documentVectorId INTEGER PRIMARY KEY AUTOINCREMENT,
          embedding TEXT,
          fkChunkId INTEGER NOT NULL,
          FOREIGN KEY (fkChunkId) REFERENCES DocumentChunks(chunkId) ON DELETE CASCADE
        );
      `,
        (err) => {
          if (err) reject(err);
          else {
            db.run(
              `
            CREATE TABLE IF NOT EXISTS Messages (
              messageId INTEGER PRIMARY KEY AUTOINCREMENT,
              sender TEXT,
              text TEXT,
              createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
            );
          `,
              (err) => {
                if (err) reject(err);
                else resolve();
              }
            );
          }
        }
      );
    });
  });
}
