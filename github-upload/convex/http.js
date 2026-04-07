import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

const http = httpRouter();

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function optionsResponse() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    },
  });
}

function getToken(request) {
  const authorization = request.headers.get("authorization") ?? "";
  return authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : null;
}

async function parseJson(request) {
  return await request.json();
}

function sanitizeUpsertBody(body) {
  if (!body || typeof body !== "object") {
    return {};
  }

  const payload = { ...body };
  if (payload.id == null || payload.id === "") {
    delete payload.id;
  }

  return payload;
}

async function withToken(request) {
  const token = getToken(request);
  if (!token) {
    throw new Error("Sessao invalida.");
  }

  return token;
}

const optionsHandler = httpAction(async () => optionsResponse());

[
  "/api/auth/register",
  "/api/auth/login",
  "/api/auth/me",
  "/api/auth/logout",
  "/api/workspace",
  "/api/pdfs/upload",
  "/api/pdfs/delete",
  "/api/maquinas/upsert",
  "/api/maquinas/delete",
  "/api/operacoes/upsert",
  "/api/operacoes/delete",
  "/api/materiais/upsert",
  "/api/materiais/delete",
  "/api/vchhm/upsert",
  "/api/vchhm/delete",
  "/api/fichas/upsert",
  "/api/fichas/delete",
  "/api/anotacoes/upsert",
].forEach((path) => {
  http.route({ path, method: "OPTIONS", handler: optionsHandler });
});

http.route({
  path: "/api/health",
  method: "GET",
  handler: httpAction(async () =>
    json({
      status: "ok",
      backend: "convex",
      timestamp: new Date().toISOString(),
    }),
  ),
});

http.route({
  path: "/api/auth/register",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await parseJson(request);
      const nome = typeof body.nome === "string" ? body.nome.trim() : "";
      const email = typeof body.email === "string" ? body.email.trim() : "";
      const senha = typeof body.senha === "string" ? body.senha : "";

      if (!nome || !email || senha.length < 4) {
        return json(
          { error: "Informe nome, email e uma senha com pelo menos 4 caracteres." },
          400,
        );
      }

      const result = await ctx.runMutation(internal.api.registerUser, {
        nome,
        email,
        senha,
      });
      return json(result, 201);
    } catch (error) {
      return json({ error: error.message ?? "Falha ao cadastrar." }, 400);
    }
  }),
});

http.route({
  path: "/api/auth/login",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await parseJson(request);
      const email = typeof body.email === "string" ? body.email.trim() : "";
      const senha = typeof body.senha === "string" ? body.senha : "";

      if (!email || !senha) {
        return json({ error: "Informe email e senha." }, 400);
      }

      const result = await ctx.runMutation(internal.api.loginUser, { email, senha });
      return json(result);
    } catch (error) {
      return json({ error: error.message ?? "Falha ao entrar." }, 401);
    }
  }),
});

http.route({
  path: "/api/auth/me",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    try {
      const token = await withToken(request);
      const user = await ctx.runQuery(internal.api.getUserByToken, { token });
      if (!user) {
        return json({ error: "Sessao invalida." }, 401);
      }

      return json({ user });
    } catch (error) {
      return json({ error: error.message ?? "Sessao invalida." }, 401);
    }
  }),
});

http.route({
  path: "/api/auth/logout",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const token = getToken(request);
    if (token) {
      await ctx.runMutation(internal.api.logoutSession, { token });
    }

    return json({ ok: true });
  }),
});

http.route({
  path: "/api/workspace",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    try {
      const token = await withToken(request);
      const workspace = await ctx.runQuery(internal.api.getWorkspaceByToken, { token });
      return json(workspace);
    } catch (error) {
      return json({ error: error.message ?? "Falha ao carregar workspace." }, 401);
    }
  }),
});

http.route({
  path: "/api/pdfs/upload",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const token = await withToken(request);
      const formData = await request.formData();
      const id = String(formData.get("id") ?? "").trim();
      const nome = String(formData.get("nome") ?? "").trim();
      const file = formData.get("file");

      if (!nome) {
        return json({ error: "Informe um nome para o PDF." }, 400);
      }

      let storageId;
      let arquivoNome;
      let contentType;

      if (file instanceof Blob && file.size > 0) {
        storageId = await ctx.storage.store(file);
        arquivoNome = "name" in file ? file.name : "arquivo.pdf";
        contentType = file.type || "application/pdf";
      }

      await ctx.runMutation(internal.api.upsertPdfRecord, {
        token,
        id: id || undefined,
        nome,
        arquivoNome,
        contentType,
        storageId,
      });

      const workspace = await ctx.runQuery(internal.api.getWorkspaceByToken, { token });
      return json(workspace, 201);
    } catch (error) {
      return json({ error: error.message ?? "Falha ao enviar PDF." }, 400);
    }
  }),
});

http.route({
  path: "/api/pdfs/delete",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const token = await withToken(request);
      const body = await parseJson(request);
      await ctx.runMutation(internal.api.deletePdf, { token, id: body.id });
      const workspace = await ctx.runQuery(internal.api.getWorkspaceByToken, { token });
      return json(workspace);
    } catch (error) {
      return json({ error: error.message ?? "Falha ao excluir PDF." }, 400);
    }
  }),
});

[
  {
    path: "/api/maquinas/upsert",
    fn: internal.api.upsertMachine,
    error: "Falha ao salvar maquina.",
  },
  {
    path: "/api/materiais/upsert",
    fn: internal.api.upsertMaterial,
    error: "Falha ao salvar material.",
  },
  {
    path: "/api/operacoes/upsert",
    fn: internal.api.upsertOperation,
    error: "Falha ao salvar operacao.",
  },
  {
    path: "/api/vchhm/upsert",
    fn: internal.api.upsertVchhmRow,
    error: "Falha ao salvar linha VCHHM.",
  },
  {
    path: "/api/fichas/upsert",
    fn: internal.api.upsertProductionSheet,
    error: "Falha ao salvar ficha de producao.",
  },
  {
    path: "/api/anotacoes/upsert",
    fn: internal.api.upsertAnnotation,
    error: "Falha ao salvar anotacao.",
  },
].forEach(({ path, fn, error }) => {
  http.route({
    path,
    method: "POST",
    handler: httpAction(async (ctx, request) => {
      try {
        const token = await withToken(request);
        const body = sanitizeUpsertBody(await parseJson(request));
        await ctx.runMutation(fn, { token, ...body });
        const workspace = await ctx.runQuery(internal.api.getWorkspaceByToken, { token });
        return json(workspace);
      } catch (caughtError) {
        return json({ error: caughtError.message ?? error }, 400);
      }
    }),
  });
});

[
  {
    path: "/api/maquinas/delete",
    fn: internal.api.deleteMachine,
    error: "Falha ao excluir maquina.",
  },
  {
    path: "/api/materiais/delete",
    fn: internal.api.deleteMaterial,
    error: "Falha ao excluir material.",
  },
  {
    path: "/api/operacoes/delete",
    fn: internal.api.deleteOperation,
    error: "Falha ao excluir operacao.",
  },
  {
    path: "/api/vchhm/delete",
    fn: internal.api.deleteVchhmRow,
    error: "Falha ao excluir linha VCHHM.",
  },
  {
    path: "/api/fichas/delete",
    fn: internal.api.deleteProductionSheet,
    error: "Falha ao excluir ficha de producao.",
  },
].forEach(({ path, fn, error }) => {
  http.route({
    path,
    method: "POST",
    handler: httpAction(async (ctx, request) => {
      try {
        const token = await withToken(request);
        const body = await parseJson(request);
        await ctx.runMutation(fn, { token, id: body.id });
        const workspace = await ctx.runQuery(internal.api.getWorkspaceByToken, { token });
        return json(workspace);
      } catch (caughtError) {
        return json({ error: caughtError.message ?? error }, 400);
      }
    }),
  });
});

export default http;
