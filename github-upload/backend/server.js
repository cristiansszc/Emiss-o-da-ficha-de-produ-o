import express from "express";
import process from "node:process";
import {
  createIncomingMessage,
  getPendingMessagesCount,
  ingestWhatsAppWebhook,
  listMessages,
  replyToMessage,
} from "./messages-service.js";

const app = express();
const port = Number(process.env.MESSAGES_PORT ?? 3002);
const allowedOrigin = process.env.MESSAGES_ALLOWED_ORIGIN ?? "*";
const webhookSecret = process.env.WHATSAPP_WEBHOOK_SECRET ?? "dev-whatsapp-secret";
const webhookVerifyToken =
  process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN ?? "dev-whatsapp-secret";

app.use(express.json({ limit: "512kb" }));

app.use((request, response, next) => {
  response.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Webhook-Secret");

  if (request.method === "OPTIONS") {
    response.sendStatus(204);
    return;
  }

  next();
});

app.get("/api/health", (_request, response) => {
  response.json({
    status: "ok",
    service: "mensagens",
    timestamp: new Date().toISOString(),
  });
});

app.get("/api/mensagens/pendentes", (_request, response) => {
  response.json({ pendentes: getPendingMessagesCount() });
});

app.get("/api/mensagens", (_request, response) => {
  const mensagens = listMessages();
  response.json({ mensagens });
});

app.post("/api/mensagens", (request, response) => {
  try {
    const mensagem = createIncomingMessage(request.body ?? {});
    response.status(201).json({
      mensagem,
      pendentes: getPendingMessagesCount(),
      mensagens: listMessages(),
    });
  } catch (error) {
    response.status(400).json({ error: error.message ?? "Falha ao salvar a mensagem." });
  }
});

app.post("/api/responder", (request, response) => {
  try {
    const mensagem = replyToMessage(request.body ?? {});
    response.json({
      mensagem,
      pendentes: getPendingMessagesCount(),
      mensagens: listMessages(),
    });
  } catch (error) {
    response.status(400).json({ error: error.message ?? "Falha ao responder a mensagem." });
  }
});

// Endpoint de verificacao preparado para o fluxo oficial da Meta.
app.get("/webhook", (request, response) => {
  const mode = request.query["hub.mode"];
  const verifyToken = request.query["hub.verify_token"];
  const challenge = request.query["hub.challenge"];

  if (mode === "subscribe" && verifyToken === webhookVerifyToken) {
    response.status(200).send(challenge ?? "ok");
    return;
  }

  response.status(403).json({ error: "Verificacao do webhook negada." });
});

app.post("/webhook", (request, response) => {
  const receivedSecret = request.get("x-webhook-secret") ?? "";
  if (receivedSecret !== webhookSecret) {
    response.status(401).json({ error: "Webhook invalido." });
    return;
  }

  try {
    const mensagens = ingestWhatsAppWebhook(request.body ?? {});
    response.status(201).json({
      ok: true,
      recebidas: mensagens.length,
      pendentes: getPendingMessagesCount(),
    });
  } catch (error) {
    response.status(400).json({ error: error.message ?? "Falha ao processar o webhook." });
  }
});

app.listen(port, () => {
  console.log(`Servidor de mensagens em http://localhost:${port}`);
});
