import sqlite3 from 'sqlite3';
import path from 'path';
import { logger } from '../utilities/logger';

let dbInstance: sqlite3.Database | null = null;

export function getDatabaseInstance(): sqlite3.Database {
  if (!dbInstance) {
    const dbPath = path.isAbsolute(process.env.DB_PATH!)
      ? process.env.DB_PATH!
      : path.join(__dirname, process.env.DB_PATH!);
    dbInstance = new sqlite3.Database(dbPath);
  }
  return dbInstance;
}

function runAsync(db: sqlite3.Database, sql: string): Promise<void> {
  return new Promise((resolve, reject) => {
    db.run(sql, (err) => (err ? reject(err) : resolve()));
  });
}

export async function setupDatabase() {
  const db = getDatabaseInstance();
  try {
    await runAsync(db, 'PRAGMA foreign_keys = ON;');
    await runAsync(
      db,
      `
      CREATE TABLE IF NOT EXISTS DocumentChunks (
        chunkId INTEGER PRIMARY KEY AUTOINCREMENT,
        fileName TEXT,
        chunkIndex INTEGER,
        content TEXT
      );
    `
    );
    await runAsync(
      db,
      `
      CREATE TABLE IF NOT EXISTS DocumentVectors (
        documentVectorId INTEGER PRIMARY KEY AUTOINCREMENT,
        embedding TEXT,
        fkChunkId INTEGER NOT NULL,
        FOREIGN KEY (fkChunkId) REFERENCES DocumentChunks(chunkId) ON DELETE CASCADE
      );
    `
    );
    await runAsync(
      db,
      `
      CREATE TABLE IF NOT EXISTS Messages (
        messageId INTEGER PRIMARY KEY AUTOINCREMENT,
        sender TEXT,
        text TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `
    );
    logger.info('Database setup complete.');
  } catch (err) {
    logger.error('Database setup failed:', err);
    throw err;
  }
}
