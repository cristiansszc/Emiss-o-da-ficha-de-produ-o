import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const backendDirectory = fileURLToPath(new URL(".", import.meta.url));
const projectDirectory = join(backendDirectory, "..");
const databaseDirectory = join(projectDirectory, "database");
const databaseFile = join(databaseDirectory, "mensagens.sqlite");
const schemaFile = join(databaseDirectory, "schema.sql");

if (!existsSync(databaseDirectory)) {
  mkdirSync(databaseDirectory, { recursive: true });
}

export const db = new DatabaseSync(databaseFile);

db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA foreign_keys = ON;");
db.exec(readFileSync(schemaFile, "utf-8"));
