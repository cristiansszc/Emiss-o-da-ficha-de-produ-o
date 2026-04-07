import { db } from "./db.js";

function sanitizeText(value, maxLength) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function normalizePhone(value) {
  return String(value ?? "").replace(/\D/g, "").slice(0, 20);
}

function normalizeEmail(value) {
  return sanitizeText(value, 160).toLowerCase();
}

function formatMessageRow(row) {
  return {
    id: row.id,
    contato_id: row.contato_id,
    mensagem: row.mensagem,
    resposta: row.resposta ?? "",
    status: row.status,
    data_criacao: row.data_criacao,
    contato: {
      id: row.contato_id,
      nome: row.contato_nome,
      telefone: row.contato_telefone,
      email: row.contato_email ?? "",
    },
  };
}

function getContactByPhoneOrEmail(telefone, email) {
  if (telefone) {
    const byPhone = db
      .prepare(
        `
          SELECT id, nome, telefone, email
          FROM contatos
          WHERE telefone = ?
          LIMIT 1
        `,
      )
      .get(telefone);

    if (byPhone) {
      return byPhone;
    }
  }

  if (email) {
    return (
      db
        .prepare(
          `
            SELECT id, nome, telefone, email
            FROM contatos
            WHERE lower(email) = lower(?)
            LIMIT 1
          `,
        )
        .get(email) ?? null
    );
  }

  return null;
}

function upsertContact({ nome, telefone, email }) {
  const safePhone = normalizePhone(telefone);
  const safeEmail = normalizeEmail(email);
  const safeName = sanitizeText(nome, 120) || (safePhone ? `Contato ${safePhone}` : "Contato sem nome");

  if (!safePhone) {
    throw new Error("Telefone obrigatorio para registrar a mensagem.");
  }

  const existing = getContactByPhoneOrEmail(safePhone, safeEmail);
  if (existing) {
    db.prepare(
      `
        UPDATE contatos
        SET nome = ?, email = ?
        WHERE id = ?
      `,
    ).run(safeName, safeEmail || existing.email || null, existing.id);

    return { ...existing, nome: safeName, telefone: safePhone, email: safeEmail || existing.email || "" };
  }

  const result = db
    .prepare(
      `
        INSERT INTO contatos (nome, telefone, email)
        VALUES (?, ?, ?)
      `,
    )
    .run(safeName, safePhone, safeEmail || null);

  return {
    id: Number(result.lastInsertRowid),
    nome: safeName,
    telefone: safePhone,
    email: safeEmail,
  };
}

export function getPendingMessagesCount() {
  const row = db
    .prepare(
      `
        SELECT COUNT(*) AS total
        FROM mensagens
        WHERE status = 'pendente'
      `,
    )
    .get();

  return Number(row?.total ?? 0);
}

export function listMessages() {
  const rows = db
    .prepare(
      `
        SELECT
          mensagens.id,
          mensagens.contato_id,
          mensagens.mensagem,
          mensagens.resposta,
          mensagens.status,
          mensagens.data_criacao,
          contatos.nome AS contato_nome,
          contatos.telefone AS contato_telefone,
          contatos.email AS contato_email
        FROM mensagens
        INNER JOIN contatos ON contatos.id = mensagens.contato_id
        ORDER BY datetime(mensagens.data_criacao) DESC, mensagens.id DESC
      `,
    )
    .all();

  return rows.map(formatMessageRow);
}

export function createIncomingMessage({ nome, telefone, email, mensagem }) {
  const safeMessage = sanitizeText(mensagem, 4000);
  if (!safeMessage) {
    throw new Error("Mensagem obrigatoria.");
  }

  const contact = upsertContact({ nome, telefone, email });
  const createdAt = new Date().toISOString();
  const result = db
    .prepare(
      `
        INSERT INTO mensagens (contato_id, mensagem, resposta, status, data_criacao)
        VALUES (?, ?, '', 'pendente', ?)
      `,
    )
    .run(contact.id, safeMessage, createdAt);

  return {
    id: Number(result.lastInsertRowid),
    contato_id: contact.id,
    mensagem: safeMessage,
    resposta: "",
    status: "pendente",
    data_criacao: createdAt,
    contato: contact,
  };
}

export function replyToMessage({ id, resposta }) {
  const messageId = Number(id);
  const safeReply = sanitizeText(resposta, 4000);

  if (!Number.isInteger(messageId) || messageId <= 0) {
    throw new Error("Mensagem invalida.");
  }

  if (!safeReply) {
    throw new Error("Digite a resposta antes de confirmar o envio.");
  }

  const current = db
    .prepare(
      `
        SELECT id
        FROM mensagens
        WHERE id = ?
        LIMIT 1
      `,
    )
    .get(messageId);

  if (!current) {
    throw new Error("Mensagem nao encontrada.");
  }

  db.prepare(
    `
      UPDATE mensagens
      SET resposta = ?, status = 'respondido'
      WHERE id = ?
    `,
  ).run(safeReply, messageId);

  return listMessages().find((message) => message.id === messageId) ?? null;
}

function extractWebhookText(message) {
  if (typeof message?.text?.body === "string") {
    return message.text.body;
  }

  if (typeof message?.button?.text === "string") {
    return message.button.text;
  }

  if (typeof message?.interactive?.button_reply?.title === "string") {
    return message.interactive.button_reply.title;
  }

  return "";
}

export function ingestWhatsAppWebhook(payload) {
  const created = [];
  const entries = Array.isArray(payload?.entry) ? payload.entry : [];

  if (!entries.length && payload?.telefone && payload?.mensagem) {
    created.push(
      createIncomingMessage({
        nome: payload.nome || "Contato WhatsApp",
        telefone: payload.telefone,
        email: payload.email || "",
        mensagem: payload.mensagem,
      }),
    );
    return created;
  }

  entries.forEach((entry) => {
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];

    changes.forEach((change) => {
      const value = change?.value ?? {};
      const contacts = Array.isArray(value.contacts) ? value.contacts : [];
      const incomingMessages = Array.isArray(value.messages) ? value.messages : [];

      incomingMessages.forEach((message) => {
        const phone = normalizePhone(message?.from || contacts[0]?.wa_id || "");
        const name =
          contacts.find((contact) => normalizePhone(contact?.wa_id) === phone)?.profile?.name ||
          contacts[0]?.profile?.name ||
          "Contato WhatsApp";
        const text = extractWebhookText(message);

        if (phone && text) {
          created.push(
            createIncomingMessage({
              nome: name,
              telefone: phone,
              email: "",
              mensagem: text,
            }),
          );
        }
      });
    });
  });

  return created;
}
