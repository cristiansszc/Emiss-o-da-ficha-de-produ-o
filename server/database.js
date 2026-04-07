import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDirectory = join(__dirname, "..", "data");
const databasePath = join(dataDirectory, "database.json");

const defaultDatabase = {
  usuarios: [],
  sessoes: [],
  tarefas: [
    {
      id: 1,
      texto: "Servidor e banco conectados",
      usuarioId: 0,
      usuarioNome: "Sistema",
      criadaEm: new Date().toISOString(),
    },
  ],
};

function createId(items) {
  return items.length > 0 ? Math.max(...items.map((item) => item.id)) + 1 : 1;
}

function hashPassword(password, salt = randomBytes(16).toString("hex")) {
  const hashed = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hashed}`;
}

function verifyPassword(password, storedHash) {
  const [salt, key] = storedHash.split(":");
  const hashedBuffer = scryptSync(password, salt, 64);
  const keyBuffer = Buffer.from(key, "hex");
  return timingSafeEqual(hashedBuffer, keyBuffer);
}

function ensureDatabase() {
  if (!existsSync(dataDirectory)) {
    mkdirSync(dataDirectory, { recursive: true });
  }

  if (!existsSync(databasePath)) {
    writeFileSync(databasePath, JSON.stringify(defaultDatabase, null, 2));
  }
}

function readDatabase() {
  ensureDatabase();
  return JSON.parse(readFileSync(databasePath, "utf-8"));
}

function writeDatabase(database) {
  ensureDatabase();
  writeFileSync(databasePath, JSON.stringify(database, null, 2));
}

export function listTasks() {
  return readDatabase().tarefas;
}

export function listTasksByUser(userId) {
  return readDatabase()
    .tarefas
    .filter((tarefa) => tarefa.usuarioId === userId || tarefa.usuarioId === 0)
    .sort((a, b) => new Date(b.criadaEm) - new Date(a.criadaEm));
}

export function createTask(texto, user) {
  const database = readDatabase();
  const task = {
    id: createId(database.tarefas),
    texto,
    usuarioId: user.id,
    usuarioNome: user.nome,
    criadaEm: new Date().toISOString(),
  };

  database.tarefas.push(task);
  writeDatabase(database);

  return task;
}

export function createUser({ nome, email, senha }) {
  const database = readDatabase();
  const normalizedEmail = email.trim().toLowerCase();

  if (database.usuarios.some((usuario) => usuario.email === normalizedEmail)) {
    throw new Error("Ja existe uma conta com esse email.");
  }

  const user = {
    id: createId(database.usuarios),
    nome: nome.trim(),
    email: normalizedEmail,
    senhaHash: hashPassword(senha),
    criadoEm: new Date().toISOString(),
  };

  database.usuarios.push(user);
  writeDatabase(database);

  return sanitizeUser(user);
}

export function authenticateUser(email, senha) {
  const database = readDatabase();
  const normalizedEmail = email.trim().toLowerCase();
  const user = database.usuarios.find((item) => item.email === normalizedEmail);

  if (!user || !verifyPassword(senha, user.senhaHash)) {
    throw new Error("Email ou senha invalidos.");
  }

  return sanitizeUser(user);
}

export function createSession(userId) {
  const database = readDatabase();
  const session = {
    id: createId(database.sessoes),
    token: randomBytes(24).toString("hex"),
    usuarioId: userId,
    criadaEm: new Date().toISOString(),
  };

  database.sessoes.push(session);
  writeDatabase(database);

  return session;
}

export function getUserByToken(token) {
  const database = readDatabase();
  const session = database.sessoes.find((item) => item.token === token);
  if (!session) return null;

  const user = database.usuarios.find((item) => item.id === session.usuarioId);
  return user ? sanitizeUser(user) : null;
}

export function deleteSession(token) {
  const database = readDatabase();
  database.sessoes = database.sessoes.filter((item) => item.token !== token);
  writeDatabase(database);
}

function sanitizeUser(user) {
  return {
    id: user.id,
    nome: user.nome,
    email: user.email,
    criadoEm: user.criadoEm,
  };
}

ensureDatabase();
