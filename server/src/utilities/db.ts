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
    // Create Files table
    await runAsync(
      db,
      `
      CREATE TABLE IF NOT EXISTS Files (
        fileId INTEGER PRIMARY KEY AUTOINCREMENT,
        fileName TEXT NOT NULL 
      );
    `
    );
    // Create FileChunks table
    await runAsync(
      db,
      `
      CREATE TABLE IF NOT EXISTS FileChunks (
        fileChunkId INTEGER PRIMARY KEY AUTOINCREMENT,
        fkFileId INTEGER NOT NULL,
        chunkIndex INTEGER,
        content TEXT,
        FOREIGN KEY (fkFileId) REFERENCES Files(fileId) ON DELETE CASCADE
      );
    `
    );
    // Create FileVectors table
    await runAsync(
      db,
      `
      CREATE TABLE IF NOT EXISTS FileVectors (
        fileVectorId INTEGER PRIMARY KEY AUTOINCREMENT,
        embedding TEXT,
        fkChunkId INTEGER NOT NULL,
        FOREIGN KEY (fkChunkId) REFERENCES FileChunks(fileChunkId) ON DELETE CASCADE
      );
    `
    );
    await runAsync(
      db,
      `
      CREATE TABLE IF NOT EXISTS Messages (
        messageId INTEGER PRIMARY KEY AUTOINCREMENT,
        role TEXT,
        text TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `
    );

    // Create a view that estimates messages size in Mb
    await runAsync(
      db,
      `
      CREATE VIEW IF NOT EXISTS MessagesSizeView AS
      SELECT 
        -- Calculate total text length
        -- Add 8 bytes per message for JSON structure ({"text": "", "role": ""})
        -- Add 2 bytes for array brackets and divide by 1MB
        (SUM(LENGTH(COALESCE(text, '')) + LENGTH(COALESCE(role, '')) + 8) + 2) / 1024.0 / 1024.0 as sizeInMb,
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
