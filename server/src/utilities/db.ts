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
        CREATE TABLE IF NOT EXISTS Documents (
          documentId INTEGER PRIMARY KEY AUTOINCREMENT,
          fileName TEXT,
          chunkIndex INTEGER,
          content TEXT
        );
      `);
      db.run(`
        CREATE TABLE IF NOT EXISTS DocumentVectors (
          documentVectorId INTEGER PRIMARY KEY AUTOINCREMENT,
          embedding TEXT,
          documentId INTEGER
        );
      `, (err) => {
        if (err) reject(err);
        else {
          // Add a table for chat messages
          db.run(`
            CREATE TABLE IF NOT EXISTS Messages (
              messageId INTEGER PRIMARY KEY AUTOINCREMENT,
              sender TEXT,
              text TEXT,
              createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
            );
          `, (err) => {
            if (err) reject(err);
            else {
              resolve();
            }
          });
        }
      });
    });
  });
}
