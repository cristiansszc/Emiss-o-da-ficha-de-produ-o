import { createServer } from "node:http";
import { existsSync, createReadStream } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  authenticateUser,
  createSession,
  createTask,
  createUser,
  deleteSession,
  getUserByToken,
  listTasksByUser,
} from "./database.js";

const port = Number(process.env.PORT ?? 3001);
const serverDirectory = fileURLToPath(new URL(".", import.meta.url));
const distDirectory = join(serverDirectory, "..", "dist");

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

function sendJson(response, statusCode, data) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  response.end(JSON.stringify(data));
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";

    request.on("data", (chunk) => {
      body += chunk;
    });

    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

function getTokenFromRequest(request) {
  const authorization = request.headers.authorization ?? "";
  if (!authorization.startsWith("Bearer ")) {
    return null;
  }

  return authorization.slice("Bearer ".length);
}

function getAuthenticatedUser(request) {
  const token = getTokenFromRequest(request);
  return token ? getUserByToken(token) : null;
}

function serveStaticFile(response, filePath) {
  const extension = extname(filePath);
  response.writeHead(200, {
    "Content-Type": contentTypes[extension] ?? "application/octet-stream",
  });
  createReadStream(filePath).pipe(response);
}

const server = createServer(async (request, response) => {
  const { method = "GET", url = "/" } = request;
  const pathname = new URL(url, `http://localhost:${port}`).pathname;

  if (method === "OPTIONS") {
    response.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    response.end();
    return;
  }

  if (method === "GET" && pathname === "/api/health") {
    sendJson(response, 200, {
      status: "ok",
      database: "json",
      timestamp: new Date().toISOString(),
    });
    return;
  }

  if (method === "POST" && pathname === "/api/auth/register") {
    try {
      const rawBody = await readBody(request);
      const body = rawBody ? JSON.parse(rawBody) : {};
      const nome = typeof body.nome === "string" ? body.nome.trim() : "";
      const email = typeof body.email === "string" ? body.email.trim() : "";
      const senha = typeof body.senha === "string" ? body.senha : "";

      if (!nome || !email || senha.length < 4) {
        sendJson(response, 400, {
          error: "Informe nome, email e uma senha com pelo menos 4 caracteres.",
        });
        return;
      }

      const user = createUser({ nome, email, senha });
      const session = createSession(user.id);

      sendJson(response, 201, { user, token: session.token });
    } catch (error) {
      sendJson(response, 400, { error: error.message });
    }
    return;
  }

  if (method === "POST" && pathname === "/api/auth/login") {
    try {
      const rawBody = await readBody(request);
      const body = rawBody ? JSON.parse(rawBody) : {};
      const email = typeof body.email === "string" ? body.email.trim() : "";
      const senha = typeof body.senha === "string" ? body.senha : "";

      if (!email || !senha) {
        sendJson(response, 400, { error: "Informe email e senha." });
        return;
      }

      const user = authenticateUser(email, senha);
      const session = createSession(user.id);
      sendJson(response, 200, { user, token: session.token });
    } catch (error) {
      sendJson(response, 401, { error: error.message });
    }
    return;
  }

  if (method === "GET" && pathname === "/api/auth/me") {
    const user = getAuthenticatedUser(request);
    if (!user) {
      sendJson(response, 401, { error: "Sessao invalida." });
      return;
    }

    sendJson(response, 200, { user });
    return;
  }

  if (method === "POST" && pathname === "/api/auth/logout") {
    const token = getTokenFromRequest(request);
    if (token) {
      deleteSession(token);
    }

    sendJson(response, 200, { ok: true });
    return;
  }

  if (method === "GET" && pathname === "/api/tasks") {
    const user = getAuthenticatedUser(request);
    if (!user) {
      sendJson(response, 401, { error: "Faca login para ver as tarefas." });
      return;
    }

    sendJson(response, 200, { tarefas: listTasksByUser(user.id) });
    return;
  }

  if (method === "POST" && pathname === "/api/tasks") {
    try {
      const user = getAuthenticatedUser(request);
      if (!user) {
        sendJson(response, 401, { error: "Faca login para salvar tarefas." });
        return;
      }

      const rawBody = await readBody(request);
      const body = rawBody ? JSON.parse(rawBody) : {};
      const texto = typeof body.texto === "string" ? body.texto.trim() : "";

      if (!texto) {
        sendJson(response, 400, { error: "O campo texto e obrigatorio." });
        return;
      }

      const task = createTask(texto, user);
      sendJson(response, 201, task);
    } catch {
      sendJson(response, 400, { error: "Nao foi possivel ler a requisicao." });
    }
    return;
  }

  if (method === "GET" && existsSync(distDirectory)) {
    const requestedPath =
      pathname === "/"
        ? join(distDirectory, "index.html")
        : join(distDirectory, pathname.slice(1));
    const fallbackPath = join(distDirectory, "index.html");

    if (existsSync(requestedPath) && !requestedPath.endsWith("\\") && !requestedPath.endsWith("/")) {
      serveStaticFile(response, requestedPath);
      return;
    }

    if (existsSync(fallbackPath)) {
      serveStaticFile(response, fallbackPath);
      return;
    }
  }

  sendJson(response, 404, { error: "Rota nao encontrada." });
});

server.listen(port, () => {
  console.log(`Servidor rodando em http://localhost:${port}`);
});
