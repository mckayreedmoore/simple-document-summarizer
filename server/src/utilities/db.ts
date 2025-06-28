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

export function runAsync(db: sqlite3.Database, sql: string): Promise<void> {
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

    // Create a view that estimates conversation size in Mb
    await runAsync(
      db,
      `
      CREATE VIEW IF NOT EXISTS ConversationSizeView AS
      SELECT 
        -- Calculate total text length
        -- Add 8 bytes per message for JSON structure ({"text": "", "role": ""})
        -- Add 2 bytes for array brackets and divide by 1MB
        (SUM(LENGTH(COALESCE(text, '')) + LENGTH(COALESCE(sender, '')) + 8) + 2) / 1024.0 / 1024.0 as sizeInMb,
        COUNT(*) as messageCount
      FROM Messages;
    `
    );
    logger.info('Database setup complete.');
  } catch (err) {
    logger.error('Database setup failed:', err);
    throw err;
  }
}
