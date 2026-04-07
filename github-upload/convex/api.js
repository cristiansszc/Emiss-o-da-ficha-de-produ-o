import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

function toHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function hashPassword(password) {
  const data = new TextEncoder().encode(password);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return toHex(digest);
}

function createToken() {
  return `${crypto.randomUUID()}${crypto.randomUUID().replaceAll("-", "")}`;
}

function normalizeText(value) {
  return value.trim().toLowerCase();
}

function sanitizeUser(user) {
  return {
    id: user._id,
    nome: user.nome,
    email: user.email,
    criadoEm: user.criadoEm,
  };
}

async function getSessionByToken(ctx, token) {
  return await ctx.db
    .query("sessoes")
    .withIndex("by_token", (q) => q.eq("token", token))
    .unique();
}

async function requireUser(ctx, token) {
  const session = await getSessionByToken(ctx, token);
  if (!session) {
    throw new Error("Sessao invalida.");
  }

  const user = await ctx.db.get(session.usuarioId);
  if (!user) {
    throw new Error("Usuario nao encontrado.");
  }

  return { session, user };
}

function sortByNewest(items, field) {
  return [...items].sort((a, b) => b[field].localeCompare(a[field]));
}

export const registerUser = internalMutation({
  args: {
    nome: v.string(),
    email: v.string(),
    senha: v.string(),
  },
  handler: async (ctx, args) => {
    const email = normalizeText(args.email);
    const existing = await ctx.db
      .query("usuarios")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();

    if (existing) {
      throw new Error("Ja existe uma conta com esse email.");
    }

    const userId = await ctx.db.insert("usuarios", {
      nome: args.nome.trim(),
      email,
      senhaHash: await hashPassword(args.senha),
      criadoEm: new Date().toISOString(),
    });

    const user = await ctx.db.get(userId);
    const token = createToken();
    await ctx.db.insert("sessoes", {
      token,
      usuarioId: userId,
      criadoEm: new Date().toISOString(),
    });

    return { user: sanitizeUser(user), token };
  },
});

export const loginUser = internalMutation({
  args: {
    email: v.string(),
    senha: v.string(),
  },
  handler: async (ctx, args) => {
    const email = normalizeText(args.email);
    const user = await ctx.db
      .query("usuarios")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();

    if (!user) {
      throw new Error("Email ou senha invalidos.");
    }

    const senhaHash = await hashPassword(args.senha);
    if (user.senhaHash !== senhaHash) {
      throw new Error("Email ou senha invalidos.");
    }

    const token = createToken();
    await ctx.db.insert("sessoes", {
      token,
      usuarioId: user._id,
      criadoEm: new Date().toISOString(),
    });

    return { user: sanitizeUser(user), token };
  },
});

export const getUserByToken = internalQuery({
  args: {
    token: v.string(),
  },
  handler: async (ctx, args) => {
    const session = await getSessionByToken(ctx, args.token);

    if (!session) {
      return null;
    }

    const user = await ctx.db.get(session.usuarioId);
    return user ? sanitizeUser(user) : null;
  },
});

export const logoutSession = internalMutation({
  args: {
    token: v.string(),
  },
  handler: async (ctx, args) => {
    const session = await getSessionByToken(ctx, args.token);

    if (session) {
      await ctx.db.delete(session._id);
    }

    return { ok: true };
  },
});

export const getWorkspaceByToken = internalQuery({
  args: {
    token: v.string(),
  },
  handler: async (ctx, args) => {
    const { user } = await requireUser(ctx, args.token);

    const [pdfs, maquinas, operacoes, materiais, vchhmRows, productionSheets, anotacoes] = await Promise.all([
      ctx.db.query("pdfs").withIndex("by_usuario", (q) => q.eq("usuarioId", user._id)).collect(),
      ctx.db.query("maquinas").withIndex("by_usuario", (q) => q.eq("usuarioId", user._id)).collect(),
      ctx.db.query("operacoes").withIndex("by_usuario", (q) => q.eq("usuarioId", user._id)).collect(),
      ctx.db.query("materiais").withIndex("by_usuario", (q) => q.eq("usuarioId", user._id)).collect(),
      ctx.db.query("vchhmRows").withIndex("by_usuario", (q) => q.eq("usuarioId", user._id)).collect(),
      ctx.db
        .query("productionSheets")
        .withIndex("by_usuario", (q) => q.eq("usuarioId", user._id))
        .collect(),
      ctx.db.query("anotacoes").withIndex("by_usuario", (q) => q.eq("usuarioId", user._id)).collect(),
    ]);

    const pdfsWithUrls = await Promise.all(
      pdfs.map(async (pdf) => ({
        ...pdf,
        url: await ctx.storage.getUrl(pdf.storageId),
      })),
    );

    return {
      pdfs: sortByNewest(pdfsWithUrls, "criadoEm"),
      maquinas: sortByNewest(maquinas, "atualizadoEm"),
      operacoes: sortByNewest(operacoes, "atualizadoEm"),
      materiais: sortByNewest(materiais, "atualizadoEm"),
      vchhmRows: sortByNewest(vchhmRows, "atualizadoEm"),
      productionSheets: sortByNewest(productionSheets, "atualizadoEm"),
      anotacoes: sortByNewest(anotacoes, "atualizadoEm"),
    };
  },
});

export const upsertPdfRecord = internalMutation({
  args: {
    token: v.string(),
    id: v.optional(v.id("pdfs")),
    nome: v.string(),
    arquivoNome: v.optional(v.string()),
    contentType: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    const { user } = await requireUser(ctx, args.token);

    if (args.id) {
      const existing = await ctx.db.get(args.id);
      if (!existing || existing.usuarioId !== user._id) {
        throw new Error("PDF nao encontrado.");
      }

      const hasNewFile = Boolean(args.storageId);
      if (hasNewFile) {
        await ctx.storage.delete(existing.storageId);
      }

      await ctx.db.patch(args.id, {
        nome: args.nome.trim(),
        searchNome: normalizeText(args.nome),
        arquivoNome: args.arquivoNome ?? existing.arquivoNome,
        contentType: args.contentType ?? existing.contentType,
        storageId: args.storageId ?? existing.storageId,
      });

      return await ctx.db.get(args.id);
    }

    if (!args.storageId || !args.arquivoNome) {
      throw new Error("Selecione um arquivo PDF para salvar.");
    }

    const pdfId = await ctx.db.insert("pdfs", {
      nome: args.nome.trim(),
      searchNome: normalizeText(args.nome),
      arquivoNome: args.arquivoNome,
      contentType: args.contentType,
      storageId: args.storageId,
      usuarioId: user._id,
      criadoEm: new Date().toISOString(),
    });

    return await ctx.db.get(pdfId);
  },
});

export const deletePdf = internalMutation({
  args: {
    token: v.string(),
    id: v.id("pdfs"),
  },
  handler: async (ctx, args) => {
    const { user } = await requireUser(ctx, args.token);
    const pdf = await ctx.db.get(args.id);

    if (!pdf || pdf.usuarioId !== user._id) {
      throw new Error("PDF nao encontrado.");
    }

    await ctx.storage.delete(pdf.storageId);
    await ctx.db.delete(pdf._id);

    return { ok: true };
  },
});

export const upsertMachine = internalMutation({
  args: {
    token: v.string(),
    id: v.optional(v.id("maquinas")),
    apelido: v.string(),
    nomeMaquina: v.string(),
    valorHoraMaquina: v.number(),
  },
  handler: async (ctx, args) => {
    const { user } = await requireUser(ctx, args.token);
    const payload = {
      apelido: args.apelido.trim(),
      nomeMaquina: args.nomeMaquina.trim(),
      valorHoraMaquina: args.valorHoraMaquina,
      usuarioId: user._id,
      atualizadoEm: new Date().toISOString(),
    };

    if (args.id) {
      const doc = await ctx.db.get(args.id);
      if (!doc || doc.usuarioId !== user._id) {
        throw new Error("Maquina nao encontrada.");
      }

      await ctx.db.patch(args.id, payload);
      return await ctx.db.get(args.id);
    }

    const id = await ctx.db.insert("maquinas", {
      ...payload,
      criadoEm: new Date().toISOString(),
    });

    return await ctx.db.get(id);
  },
});

export const deleteMachine = internalMutation({
  args: {
    token: v.string(),
    id: v.id("maquinas"),
  },
  handler: async (ctx, args) => {
    const { user } = await requireUser(ctx, args.token);
    const doc = await ctx.db.get(args.id);
    if (!doc || doc.usuarioId !== user._id) {
      throw new Error("Maquina nao encontrada.");
    }

    await ctx.db.delete(args.id);
    return { ok: true };
  },
});

export const upsertOperation = internalMutation({
  args: {
    token: v.string(),
    id: v.optional(v.id("operacoes")),
    nomeOperacao: v.string(),
  },
  handler: async (ctx, args) => {
    const { user } = await requireUser(ctx, args.token);
    const payload = {
      nomeOperacao: args.nomeOperacao.trim(),
      usuarioId: user._id,
      atualizadoEm: new Date().toISOString(),
    };

    if (args.id) {
      const doc = await ctx.db.get(args.id);
      if (!doc || doc.usuarioId !== user._id) {
        throw new Error("Operacao nao encontrada.");
      }

      await ctx.db.patch(args.id, payload);
      return await ctx.db.get(args.id);
    }

    const id = await ctx.db.insert("operacoes", {
      ...payload,
      criadoEm: new Date().toISOString(),
    });

    return await ctx.db.get(id);
  },
});

export const deleteOperation = internalMutation({
  args: {
    token: v.string(),
    id: v.id("operacoes"),
  },
  handler: async (ctx, args) => {
    const { user } = await requireUser(ctx, args.token);
    const doc = await ctx.db.get(args.id);
    if (!doc || doc.usuarioId !== user._id) {
      throw new Error("Operacao nao encontrada.");
    }

    await ctx.db.delete(args.id);
    return { ok: true };
  },
});

export const upsertMaterial = internalMutation({
  args: {
    token: v.string(),
    id: v.optional(v.id("materiais")),
    codigo: v.string(),
    descricao: v.string(),
    precoKg: v.number(),
  },
  handler: async (ctx, args) => {
    const { user } = await requireUser(ctx, args.token);
    const payload = {
      codigo: args.codigo.trim(),
      descricao: args.descricao.trim(),
      precoKg: args.precoKg,
      usuarioId: user._id,
      atualizadoEm: new Date().toISOString(),
    };

    if (args.id) {
      const doc = await ctx.db.get(args.id);
      if (!doc || doc.usuarioId !== user._id) {
        throw new Error("Material nao encontrado.");
      }

      await ctx.db.patch(args.id, payload);
      return await ctx.db.get(args.id);
    }

    const id = await ctx.db.insert("materiais", {
      ...payload,
      criadoEm: new Date().toISOString(),
    });

    return await ctx.db.get(id);
  },
});

export const deleteMaterial = internalMutation({
  args: {
    token: v.string(),
    id: v.id("materiais"),
  },
  handler: async (ctx, args) => {
    const { user } = await requireUser(ctx, args.token);
    const doc = await ctx.db.get(args.id);
    if (!doc || doc.usuarioId !== user._id) {
      throw new Error("Material nao encontrado.");
    }

    await ctx.db.delete(args.id);
    return { ok: true };
  },
});

export const upsertVchhmRow = internalMutation({
  args: {
    token: v.string(),
    id: v.optional(v.id("vchhmRows")),
    sku: v.string(),
    nomeSku: v.string(),
    maquina: v.string(),
    operacao: v.string(),
    descricao: v.string(),
    tempoPreparacao: v.number(),
    tempoPorPeca: v.number(),
    eficiencia: v.number(),
    valorPreparacao: v.number(),
    valorPreparacaoHora: v.number(),
    materialBarra: v.string(),
    descricaoMaterial: v.string(),
    tamanhoPorPecaMaterial: v.string(),
    descricaoItem: v.string(),
    programas: v.string(),
    ferramentas: v.string(),
  },
  handler: async (ctx, args) => {
    const { user } = await requireUser(ctx, args.token);
    const payload = {
      sku: args.sku.trim(),
      skuKey: normalizeText(args.sku),
      nomeSku: args.nomeSku.trim(),
      maquina: args.maquina.trim(),
      operacao: args.operacao.trim(),
      descricao: args.descricao.trim(),
      tempoPreparacao: args.tempoPreparacao,
      tempoPorPeca: args.tempoPorPeca,
      eficiencia: args.eficiencia,
      valorPreparacao: args.valorPreparacao,
      valorPreparacaoHora: args.valorPreparacaoHora,
      materialBarra: args.materialBarra.trim(),
      descricaoMaterial: args.descricaoMaterial.trim(),
      tamanhoPorPecaMaterial: args.tamanhoPorPecaMaterial.trim(),
      descricaoItem: args.descricaoItem.trim(),
      programas: args.programas.trim(),
      ferramentas: args.ferramentas.trim(),
      usuarioId: user._id,
      atualizadoEm: new Date().toISOString(),
    };

    if (args.id) {
      const doc = await ctx.db.get(args.id);
      if (!doc || doc.usuarioId !== user._id) {
        throw new Error("Linha VCHHM nao encontrada.");
      }

      await ctx.db.patch(args.id, payload);
      return await ctx.db.get(args.id);
    }

    const id = await ctx.db.insert("vchhmRows", {
      ...payload,
      criadoEm: new Date().toISOString(),
    });

    return await ctx.db.get(id);
  },
});

export const deleteVchhmRow = internalMutation({
  args: {
    token: v.string(),
    id: v.id("vchhmRows"),
  },
  handler: async (ctx, args) => {
    const { user } = await requireUser(ctx, args.token);
    const doc = await ctx.db.get(args.id);
    if (!doc || doc.usuarioId !== user._id) {
      throw new Error("Linha VCHHM nao encontrada.");
    }

    await ctx.db.delete(args.id);
    return { ok: true };
  },
});

export const upsertProductionSheet = internalMutation({
  args: {
    token: v.string(),
    id: v.optional(v.id("productionSheets")),
    sku: v.string(),
    nomeSku: v.string(),
    nomeCliente: v.string(),
    quantidadeProduzir: v.number(),
    numeroPedido: v.string(),
    pedido: v.string(),
    dataPrevista: v.string(),
    numeroOp: v.string(),
    observacao: v.optional(v.string()),
    custoPreparacao: v.number(),
    valorProduto: v.number(),
    vchhmTotal: v.number(),
  },
  handler: async (ctx, args) => {
    const { user } = await requireUser(ctx, args.token);
    const payload = {
      sku: args.sku.trim(),
      skuKey: normalizeText(args.sku),
      nomeSku: args.nomeSku.trim(),
      nomeCliente: args.nomeCliente.trim(),
      quantidadeProduzir: args.quantidadeProduzir,
      numeroPedido: args.numeroPedido.trim(),
      pedido: args.pedido.trim(),
      dataPrevista: args.dataPrevista.trim(),
      numeroOp: args.numeroOp.trim(),
      observacao: (args.observacao ?? "").trim(),
      custoPreparacao: args.custoPreparacao,
      valorProduto: args.valorProduto,
      vchhmTotal: args.vchhmTotal,
      usuarioId: user._id,
      atualizadoEm: new Date().toISOString(),
    };

    if (args.id) {
      const doc = await ctx.db.get(args.id);
      if (!doc || doc.usuarioId !== user._id) {
        throw new Error("Ficha de producao nao encontrada.");
      }

      await ctx.db.patch(args.id, payload);
      return await ctx.db.get(args.id);
    }

    const id = await ctx.db.insert("productionSheets", {
      ...payload,
      criadoEm: new Date().toISOString(),
    });

    return await ctx.db.get(id);
  },
});

export const deleteProductionSheet = internalMutation({
  args: {
    token: v.string(),
    id: v.id("productionSheets"),
  },
  handler: async (ctx, args) => {
    const { user } = await requireUser(ctx, args.token);
    const doc = await ctx.db.get(args.id);
    if (!doc || doc.usuarioId !== user._id) {
      throw new Error("Ficha de producao nao encontrada.");
    }

    await ctx.db.delete(args.id);
    return { ok: true };
  },
});

export const upsertAnnotation = internalMutation({
  args: {
    token: v.string(),
    id: v.optional(v.id("anotacoes")),
    nome: v.string(),
    descricao: v.string(),
  },
  handler: async (ctx, args) => {
    const { user } = await requireUser(ctx, args.token);
    const payload = {
      nome: args.nome.trim(),
      descricao: args.descricao.trim(),
      usuarioId: user._id,
      atualizadoEm: new Date().toISOString(),
    };

    if (args.id) {
      const doc = await ctx.db.get(args.id);
      if (!doc || doc.usuarioId !== user._id) {
        throw new Error("Anotacao nao encontrada.");
      }

      await ctx.db.patch(args.id, payload);
      return await ctx.db.get(args.id);
    }

    const id = await ctx.db.insert("anotacoes", {
      ...payload,
      criadoEm: new Date().toISOString(),
    });

    return await ctx.db.get(id);
  },
});
