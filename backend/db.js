// backend/db.js
const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");
const { Logger } = require("./lib/logger");

// Initialize logger for database operations
const logger = new Logger("Database", { debug: process.env.DEBUG === 'true' });

// Where to store DB: use env if present, else fallback to ./data/ports-tracker.db
const defaultDataDir = path.resolve(process.cwd(), "data");
const defaultDbPath = path.join(defaultDataDir, "ports-tracker.db");
const dbPath = process.env.DATABASE_PATH || defaultDbPath;

// If using the default location, ensure the dir exists
if (!process.env.DATABASE_PATH) {
  fs.mkdirSync(defaultDataDir, { recursive: true });
}
logger.info("Using database at", dbPath);
const db = new Database(dbPath);

// Check if servers table exists
const tableExists = db
  .prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='servers'"
  )
  .get();

// If not existing, create with all required columns
if (!tableExists) {
  logger.info("Creating new database tables with updated schema");
  db.exec(`
    CREATE TABLE servers (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      url TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'peer',
      parentId TEXT,
      platform TEXT DEFAULT 'standard',
      platform_config TEXT,
      platform_type TEXT DEFAULT 'auto',
      unreachable INTEGER DEFAULT 0,
      FOREIGN KEY (parentId) REFERENCES servers(id)
    );
    
    CREATE TABLE IF NOT EXISTS notes (
      server_id     TEXT NOT NULL,
      host_ip       TEXT NOT NULL,
      host_port     INTEGER NOT NULL,
      note          TEXT    NOT NULL,
      created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (server_id, host_ip, host_port),
      FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
    );
`);
  // createNotesTable.run();

  // Add updated_at to notes table if it doesn't exist
  try {
    const notesColumns = db.prepare("PRAGMA table_info(notes)").all();
    if (!notesColumns.some((col) => col.name === "updated_at")) {
      logger.info('Schema migration: Adding "updated_at" column to "notes" table.');
      db.prepare("ALTER TABLE notes ADD COLUMN updated_at DATETIME").run();
    }
  } catch (err) {
    // This can happen if the table doesn't exist yet on first run, which is fine.
    if (!err.message.includes("no such table: notes")) {
      logger.info("Error during notes table schema check:", err.message);
    }
  }

  const createIgnoresTable = db.prepare(`
  CREATE TABLE IF NOT EXISTS ignores (
    server_id TEXT NOT NULL,
    host_ip TEXT NOT NULL,
    host_port INTEGER NOT NULL,
    PRIMARY KEY (server_id, host_ip, host_port),
    FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
  );
`);
  createIgnoresTable.run();
} else {
  // Migration logic for existing tables
  try {
    // Add updated_at to notes table if it doesn't exist
    const notesColumns = db.prepare("PRAGMA table_info(notes)").all();
    if (!notesColumns.some((col) => col.name === "updated_at")) {
      logger.info('Schema migration: Adding "updated_at" column to "notes" table.');
      db.prepare("ALTER TABLE notes ADD COLUMN updated_at DATETIME").run();
    }

    const columns = db.prepare("PRAGMA table_info(servers)").all();
    const columnNames = columns.map((col) => col.name);

    if (!columnNames.includes("type")) {
      logger.info(
        "Migrating database: Table needs major restructuring (missing type column)"
      );
      const tempTableExists = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='servers_new'"
        )
        .get();
      if (tempTableExists) {
        logger.debug("Dropping existing temporary table servers_new");
        db.exec(`DROP TABLE servers_new;`);
      }
      const existingServers = db.prepare("SELECT * FROM servers").all();
      db.exec(`
        CREATE TABLE servers_new (
          id TEXT PRIMARY KEY,
          label TEXT NOT NULL,
          url TEXT NOT NULL,
          type TEXT NOT NULL DEFAULT 'peer',
          parentId TEXT,
          platform TEXT DEFAULT 'standard',
          platform_config TEXT,
          platform_type TEXT DEFAULT 'auto',
          unreachable INTEGER DEFAULT 0,
          FOREIGN KEY (parentId) REFERENCES servers(id)
        );
      `);
  for (const server of existingServers) {
        // Assumes 'id', 'label', 'url' are always present in old data
        db.prepare(
          `
          INSERT INTO servers_new (id, label, url, parentId, platform, platform_config, platform_type, unreachable, type)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
        ).run(
          server.id,
          server.label,
          server.url,
          server.parentId || null,
          server.platform || "standard",
          server.platform_config || null,
          server.platform_type || "auto",
          server.unreachable || 0,
          "peer"
        );
      }
      db.exec(`
        DROP TABLE servers;
        ALTER TABLE servers_new RENAME TO servers;
      `);
      logger.info(
        'Database schema migration for "type" column completed successfully'
      );
    } else {
      if (!columnNames.includes("platform")) {
        logger.info("Migrating database: Adding platform column to servers table");
        db.prepare(
          "ALTER TABLE servers ADD COLUMN platform TEXT DEFAULT 'standard'"
        ).run();
      }
      if (!columnNames.includes("platform_config")) {
        logger.info(
          "Migrating database: Adding platform_config column to servers table"
        );
        db.prepare("ALTER TABLE servers ADD COLUMN platform_config TEXT").run();
      }
      if (!columnNames.includes("platform_type")) {
        logger.info(
          "Migrating database: Adding platform_type column to servers table"
        );
        db.prepare(
          "ALTER TABLE servers ADD COLUMN platform_type TEXT DEFAULT 'auto'"
        ).run();
      }
    }
  } catch (migrationError) {
    logger.error(
      "FATAL: Database schema migration failed:",
      migrationError.message
    );
    logger.debug("Stack trace:", migrationError.stack || "");
    // If migration fails, server may not be able to run.
  }
}

/**
 * Ensures that a local server record with the correct URL, type, and platform_type exists in the database.
 * 
 * If the local server entry does not exist, it is created with the specified port and default platform type. If it exists but its URL, type, or platform_type are incorrect, the entry is updated accordingly.
 * 
 * @param {number} [port=3000] - The port to use for the local server's URL.
 * @param {boolean} [appDebugEnabled=false] - Enables debug logging if set to true.
 * @returns {boolean} True if the local server entry exists or was successfully created/updated; false if an error occurred or the schema is incomplete.
 */
function ensureLocalServer(port = 3000, appDebugEnabled = false) {
  try {
    const columns = db.prepare("PRAGMA table_info(servers)").all();
    const columnNames = columns.map((col) => col.name);

    if (
      !columnNames.includes("type") ||
      !columnNames.includes("platform_type")
    ) {
      logger.warn(
        'Cannot ensure local server: "servers" table schema not fully migrated (missing "type" or "platform_type" column).'
      );
      return false;
    }

    const localServer = db
      .prepare("SELECT * FROM servers WHERE id = 'local'")
      .get();
    const targetUrl = `http://localhost:${port}`;
    const targetPlatformType = "auto";

    if (!localServer) {
      logger.info(
        `Adding local server to database. ID: local, URL: ${targetUrl}, Platform Type: ${targetPlatformType}`
      );
      db.prepare(
        `
        INSERT INTO servers (id, label, url, type, unreachable, platform_type) 
        VALUES ('local', 'Local Server', ?, 'local', 0, ?)
      `
      ).run(targetUrl, targetPlatformType);
    } else {
      let needsUpdate = false;
      let updateClauses = [];
      let updateValues = [];

      if (localServer.url !== targetUrl) {
        updateClauses.push("url = ?");
        updateValues.push(targetUrl);
        needsUpdate = true;
        logger.info(`Local server URL will be updated to ${targetUrl}.`);
      }
      if (localServer.platform_type !== targetPlatformType) {
        updateClauses.push("platform_type = ?");
        updateValues.push(targetPlatformType);
        needsUpdate = true;
        logger.info(
          `Local server platform_type will be reset to '${targetPlatformType}' for auto-detection.`
        );
      }
      if (localServer.type !== "local") {
        updateClauses.push("type = ?");
        updateValues.push("local");
        needsUpdate = true;
        logger.info(`Local server type will be corrected to 'local'.`);
      }

      if (needsUpdate) {
        updateValues.push("local");
        db.prepare(
          `UPDATE servers SET ${updateClauses.join(", ")} WHERE id = ?`
        ).run(...updateValues);
        logger.info("Local server entry updated.");
      } else {
        if (appDebugEnabled) {
          logger.debug("Local server entry already up-to-date.");
        }
      }
    }
    return true;
  } catch (e) {
    logger.error("Error ensuring local server exists:", e.message);
    logger.debug("Stack trace:", e.stack || "");
    return false;
  }
}

/**
 * Updates the `platform_type` field of the local server record in the database.
 * @param {string} platformType - The new platform type to set for the local server (e.g., 'docker', 'truenas', 'system').
 * @param {boolean} [appDebugEnabled=false] - Enables additional debug logging if true.
 */
function updateLocalServerPlatformType(platformType, appDebugEnabled = false) {
  try {
    if (!platformType || typeof platformType !== "string") {
      logger.warn(
        "Invalid platformType provided to updateLocalServerPlatformType. Received:",
        platformType
      );
      return;
    }
    const result = db
      .prepare("UPDATE servers SET platform_type = ? WHERE id = 'local'")
      .run(platformType);
    if (result.changes > 0) {
      logger.info(
        `Local server platform_type updated to '${platformType}' in database.`
      );
    } else {
      if (appDebugEnabled) {
        logger.debug(
          `updateLocalServerPlatformType called with '${platformType}', but no changes were made to the database (current value might be the same or 'local' server missing).`
        );
      }
    }
  } catch (e) {
    logger.error(
      "Failed to update local server platform_type:",
      e.message
    );
    logger.debug("Stack trace:", e.stack || "");
  }
}

module.exports = db;
module.exports.ensureLocalServer = ensureLocalServer;
module.exports.updateLocalServerPlatformType = updateLocalServerPlatformType;
