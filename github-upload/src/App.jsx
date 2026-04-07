import { useDeferredValue, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import "./App.css";
import { useTheme } from "./useTheme.js";

const apiBaseUrl =
  import.meta.env.VITE_CONVEX_SITE_URL ??
  import.meta.env.VITE_API_URL ??
  "https://wary-meadowlark-569.convex.site";
const messagesApiBaseUrl =
  import.meta.env.VITE_MESSAGES_API_URL ??
  (typeof window !== "undefined" && window.location.hostname === "localhost"
    ? "http://localhost:3002"
    : "");
const storageKey = "meusite.auth.token";
const defaultClientName = "Usinik - Tuning Cars";

const emptyWorkspace = {
  pdfs: [],
  maquinas: [],
  operacoes: [],
  materiais: [],
  vchhmRows: [],
  productionSheets: [],
  anotacoes: [],
};

const emptyAuthForm = { nome: "", email: "", senha: "" };
const emptyAnnotationForm = { nome: "", descricao: "" };
const emptyMessageSimForm = { nome: "", telefone: "", email: "", mensagem: "" };
const emptyMachineForm = { id: null, apelido: "", nomeMaquina: "", valorHoraMaquina: "" };
const emptyOperationForm = { id: null, nomeOperacao: "" };
const emptyMaterialForm = { id: null, codigo: "", descricao: "", precoKg: "" };
const emptyPdfForm = { id: null, nome: "", file: null, arquivoNome: "" };
const emptyVchhmForm = {
  id: null,
  sku: "",
  nomeSku: "",
  maquina: "",
  operacao: "",
  descricao: "",
  tempoPreparacao: "",
  tempoPorPeca: "",
  eficiencia: "0.8",
  valorPreparacao: "",
  valorPreparacaoHora: "",
  materialBarra: "",
  descricaoMaterial: "",
  tamanhoPorPecaMaterial: "",
  programas: "",
  ferramentas: "",
};
const emptyProductionForm = {
  id: null,
  sku: "",
  nomeSku: "",
  quantidadeProduzir: "",
  numeroPedido: "",
  pedido: "",
  dataPrevista: "",
  numeroOp: "",
  nomeCliente: defaultClientName,
  observacao: "",
};
const moduleButtons = [
  { key: "pdfs", label: "PDFs", buttonLabel: "PDFs", tone: "blue" },
  {
    key: "vchhm",
    label: "Cadastro Sku/Tempos/Máquinas",
    buttonLabel: "Cadastro\nSku/Tempos/Máquinas",
    tone: "blue",
  },
  {
    key: "production",
    label: "Emissão da ficha de produção",
    buttonLabel: "Emissão da ficha\nde produção",
    tone: "blue",
  },
  {
    key: "catalog",
    label: "Listagem de tabelas",
    buttonLabel: "Listagem de\nTabelas",
    tone: "blue",
  },
];
const modulePreviewCopy = {
  pdfs: "Pesquisar, abrir e organizar arquivos PDF cadastrados.",
  vchhm: "Cadastrar tempos, custos e processos do VCHHM.",
  production: "Emitir, salvar e imprimir fichas de producao.",
  catalog: "Manter maquinas, operacoes e materiais sempre alinhados.",
};
const sidebarSections = [
  {
    key: "consulta",
    label: "Consulta de dados",
    hint: "Acesso rapido para pesquisar, abrir e emitir.",
    preview:
      "Veja os submenus no hover para navegar rapido sem sair da tela principal.",
    icon: "consulta",
    moduleKeys: ["pdfs", "production"],
  },
  {
    key: "edicao",
    label: "Edicao",
    hint: "Area completa para cadastro, ajuste e manutencao.",
    preview:
      "Use esta area para cadastrar, editar, excluir e manter a base pronta para crescer.",
    icon: "edicao",
    moduleKeys: ["pdfs", "vchhm", "production", "catalog"],
  },
];

function formatCurrency(value) {
  const safeValue = Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  }).format(safeValue);
}

function formatMaterialMeasure(value) {
  const safeValue = Number.isFinite(value) ? value : 0;
  return `${new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  }).format(safeValue)} - (Mt)`;
}

function roundTo(value, digits = 3) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function normalizeText(value) {
  return value.trim().toLowerCase();
}

function normalizeSearchText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function matchesSmartSearch(text, query) {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) {
    return true;
  }

  const haystack = normalizeSearchText(text);
  return normalizedQuery.split(/\s+/).every((token) => haystack.includes(token));
}

function getDescriptionPreview(value, size = 140) {
  const text = String(value ?? "").trim();
  if (text.length <= size) {
    return text;
  }

  return `${text.slice(0, size).trimEnd()}...`;
}

function resetVchhmDynamicFields(current) {
  return {
    ...current,
    id: null,
    maquina: "",
    operacao: "",
    descricao: "",
    tempoPreparacao: "",
    tempoPorPeca: "",
    eficiencia: "0.8",
    valorPreparacao: "",
    valorPreparacaoHora: "",
    programas: "",
    ferramentas: "",
  };
}

function buildVchhmGroups(rows) {
  const groups = new Map();

  rows.forEach((row) => {
    const groupLabel = row.nomeSku || row.sku || "Sem nome do produto";
    const key = row.skuKey || normalizeText(row.sku || row.nomeSku || row._id);
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        sku: row.sku || row.nomeSku || "Sem SKU",
        nomeSku: groupLabel,
        materialBarra: row.materialBarra || "",
        descricaoMaterial: row.descricaoMaterial || "",
        tamanhoPorPecaMaterial: row.tamanhoPorPecaMaterial || "",
        atualizadoEm: row.atualizadoEm || row.criadoEm || "",
        rows: [],
      });
    }

    groups.get(key).rows.push(row);
  });

  return Array.from(groups.values());
}

function resolveClientName(value) {
  const normalized = String(value ?? "").trim();
  return normalized || defaultClientName;
}

function parseNumber(value) {
  if (typeof value === "number") return value;
  if (!value) return 0;
  const parsed = Number.parseFloat(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseEfficiency(value) {
  const parsed = parseNumber(value);
  if (parsed < 0) {
    return 0;
  }

  return parsed;
}

function computePasswordStrength(password) {
  const value = String(password ?? "");
  if (!value) return 0;

  let score = 0;
  if (value.length >= 6) score += 1;
  if (value.length >= 10) score += 1;
  if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score += 1;
  if (/\d/.test(value)) score += 1;
  if (/[^A-Za-z0-9]/.test(value)) score += 1;

  return Math.min(score, 5);
}

function findMachineRate(machineName, machines) {
  const normalized = normalizeText(machineName);
  const match = machines.find((machine) => {
    const alias = normalizeText(machine.apelido ?? "");
    const name = normalizeText(machine.nomeMaquina ?? "");
    return normalized && (alias === normalized || name === normalized);
  });

  return match ? parseNumber(match.valorHoraMaquina) : 0;
}

function findMaterialByCode(code, materiais) {
  const normalized = normalizeText(code);
  return materiais.find((material) => normalizeText(material.codigo) === normalized) ?? null;
}

function computePreparationPreview(rowLike, machines) {
  const baseMachineRate = findMachineRate(rowLike.maquina ?? "", machines);
  const efficiency = parseEfficiency(rowLike.eficiencia);
  const tempoPreparacao = parseNumber(rowLike.tempoPreparacao);
  // A planilha usa o valor horario ja pronto nesta etapa.
  // Por isso, aqui a preparacao parte direto do valor da maquina salvo na base.
  const adjustedBase = roundTo(baseMachineRate, 3);
  const valorPreparacao = roundTo((adjustedBase / 50) * tempoPreparacao, 3);
  const valorPreparacaoHora = adjustedBase;

  return {
    machineRate: baseMachineRate,
    efficiency,
    baseHour: roundTo(adjustedBase, 3),
    valorPreparacao,
    valorPreparacaoHora,
  };
}

function calcularVCHHM(
  valorHoraMaquina,
  eficiencia,
  tempoPreparacao,
  quantidade,
  tempoPorPeca,
) {
  const valorHora = parseNumber(valorHoraMaquina);
  const eficienciaDecimal = parseEfficiency(eficiencia);
  const tempoPreparacaoMinutos = parseNumber(tempoPreparacao);
  const quantidadeProduzir = parseNumber(quantidade);
  const tempoPorPecaSegundos = parseNumber(tempoPorPeca);

  // A planilha do usuario chega nesta etapa com o valor por hora ja ajustado.
  // Mantemos a eficiencia salva para registro, mas a conta usa a base horaria pronta.
  const x = valorHora;

  // Custo de preparacao:
  // X / 50 = XX
  // XX * tempo de preparacao = XXX
  // XXX / quantidade a produzir = XXXX
  const xxPreparacao = x / 50;
  const xxxPreparacao = xxPreparacao * tempoPreparacaoMinutos;
  const custoPreparacao =
    quantidadeProduzir > 0 ? roundTo(xxxPreparacao / quantidadeProduzir, 3) : 0;

  // Valor do produto (unit):
  // A planilha converte a base horaria usando o mesmo fator de 50
  // antes da etapa por segundo, chegando ao divisor final 3000.
  // X / 3000 = XX
  // XX * tempo por peca = XXX
  // XXX arredondado na terceira casa decimal.
  const xxProduto = x / 3000;
  const xxxProduto = xxProduto * tempoPorPecaSegundos;
  const valorUnitario = roundTo(xxxProduto, 3);

  return {
    eficiencia: eficienciaDecimal,
    baseHora: roundTo(x, 3),
    custoPreparacao,
    totalPreparacao: roundTo(xxxPreparacao, 3),
    valorUnitario,
    vchhm: roundTo(custoPreparacao + valorUnitario, 3),
  };
}

function computeProductionMetrics(rows, machines, quantityValue) {
  const quantity = parseNumber(quantityValue);
  const lineDetails = rows.map((row) => {
    const lineMetrics = calcularVCHHM(
      findMachineRate(row.maquina ?? "", machines),
      row.eficiencia,
      row.tempoPreparacao,
      quantity,
      row.tempoPorPeca,
    );
    const savedPreparationTotal = parseNumber(row.valorPreparacao);
    const savedPreparationHour = parseNumber(row.valorPreparacaoHora);
    const adjustedHourly =
      lineMetrics.baseHora > 0 ? lineMetrics.baseHora : roundTo(savedPreparationHour, 3);
    const totalPreparacao =
      lineMetrics.totalPreparacao > 0
        ? lineMetrics.totalPreparacao
        : roundTo(savedPreparationTotal, 3);
    const preparationPerUnit =
      quantity > 0 ? roundTo(totalPreparacao / quantity, 3) : 0;
    const productUnit = roundTo((adjustedHourly / 3000) * parseNumber(row.tempoPorPeca), 3);
    const total = roundTo(preparationPerUnit + productUnit, 3);

    return {
      ...row,
      adjustedHourly,
      preparationPerUnit,
      productUnit,
      total,
      totalPreparacao,
    };
  });

  return {
    lineDetails,
    totalPreparation: roundTo(
      lineDetails.reduce((sum, row) => sum + row.preparationPerUnit, 0),
      3,
    ),
    totalProduct: roundTo(
      lineDetails.reduce((sum, row) => sum + row.productUnit, 0),
      3,
    ),
    totalVchhm: roundTo(lineDetails.reduce((sum, row) => sum + row.total, 0), 3),
  };
}

function buildPrintDraft(sheet, rows = []) {
  const materialDescriptions = [
    ...new Set(rows.map((row) => row.descricaoMaterial).filter(Boolean)),
  ];
  const barras = [...new Set(rows.map((row) => row.materialBarra).filter(Boolean))];

  return {
    ...sheet,
    rows,
    materialDescricao: materialDescriptions.join(" / "),
    barras: barras.join(" / "),
  };
}

function mapVchhmRowToForm(row, { clone = false } = {}) {
  return {
    id: clone ? null : row._id,
    sku: row.sku,
    nomeSku: row.nomeSku,
    maquina: row.maquina,
    operacao: row.operacao,
    descricao: row.descricao,
    tempoPreparacao: String(row.tempoPreparacao),
    tempoPorPeca: String(row.tempoPorPeca),
    eficiencia: String(row.eficiencia),
    valorPreparacao: String(row.valorPreparacao),
    valorPreparacaoHora: String(row.valorPreparacaoHora),
    materialBarra: row.materialBarra,
    descricaoMaterial: row.descricaoMaterial,
    tamanhoPorPecaMaterial: row.tamanhoPorPecaMaterial,
    programas: row.programas,
    ferramentas: row.ferramentas,
  };
}

function formatPrintTimestamp() {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date());
}

function formatSavedTimestamp(value) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

async function apiFetch(path, options = {}) {
  const token = localStorage.getItem(storageKey);
  const headers = new Headers(options.headers ?? {});

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  if (options.body && !(options.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error ?? "A requisicao falhou.");
  }

  return data;
}

async function messagesApiFetch(path, options = {}) {
  const headers = new Headers(options.headers ?? {});

  if (options.body && !(options.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${messagesApiBaseUrl}${path}`, {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error ?? "Nao foi possivel carregar as mensagens.");
  }

  return data;
}

function formatPhoneDisplay(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }

  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }

  return String(value ?? "").trim() || "-";
}

function playNotificationTone() {
  if (typeof window === "undefined") {
    return;
  }

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) {
    return;
  }

  try {
    const context = new AudioContextClass();
    const oscillator = context.createOscillator();
    const gainNode = context.createGain();

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(880, context.currentTime);
    oscillator.frequency.linearRampToValueAtTime(640, context.currentTime + 0.18);

    gainNode.gain.setValueAtTime(0.0001, context.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.08, context.currentTime + 0.02);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.22);

    oscillator.connect(gainNode);
    gainNode.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.24);
    oscillator.onended = () => context.close().catch(() => {});
  } catch {
    // Som opcional: se o navegador bloquear, seguimos sem interromper o fluxo.
  }
}

function AuthForm(props) {
  const {
    modo,
    onSubmit,
    carregando,
    erro,
    alternarModo,
    form,
    setForm,
    onFieldFocus,
    onFieldBlur,
  } = props;
  const isCadastro = modo === "cadastro";

  return (
    <section className="auth-panel">
      <div className="panel-kicker">Painel Industrial</div>
      <h1>{isCadastro ? "Crie o seu acesso" : "Entre para gerenciar o site"}</h1>
      <p className="panel-copy">
        Login, cadastro, PDFs, calculo de VCHHM e ficha de producao ficam todos
        centralizados no mesmo painel.
      </p>

      <form className="stack-form" onSubmit={onSubmit}>
        {isCadastro ? (
          <label className="field-block">
            <span>Nome</span>
            <input
              value={form.nome}
              onChange={(event) =>
                setForm((current) => ({ ...current, nome: event.target.value }))
              }
              onFocus={() => onFieldFocus("nome")}
              onBlur={onFieldBlur}
              placeholder="Seu nome"
            />
          </label>
        ) : null}

        <label className="field-block">
          <span>Email</span>
          <input
            type="email"
            value={form.email}
            onChange={(event) =>
              setForm((current) => ({ ...current, email: event.target.value }))
            }
            onFocus={() => onFieldFocus("email")}
            onBlur={onFieldBlur}
            placeholder="voce@empresa.com"
          />
        </label>

        <label className="field-block">
          <span>Senha</span>
          <input
            type="password"
            value={form.senha}
            onChange={(event) =>
              setForm((current) => ({ ...current, senha: event.target.value }))
            }
            onFocus={() => onFieldFocus("senha")}
            onBlur={onFieldBlur}
            placeholder="Minimo de 4 caracteres"
          />
        </label>

        <button type="submit" className="primary-button" disabled={carregando}>
          {carregando ? "Enviando..." : isCadastro ? "Criar conta" : "Entrar"}
        </button>
      </form>

      {erro ? <p className="feedback error">{erro}</p> : null}

      <button type="button" className="switch-link" onClick={alternarModo}>
        {isCadastro ? "Ja tem conta? Fazer login" : "Ainda nao tem conta? Criar cadastro"}
      </button>
    </section>
  );
}

function AuthRobotScene({ focusField, passwordStrength, hasPassword, carregando }) {
  const sceneFocus = carregando ? "away" : focusField ?? "idle";
  const robotMoods = !hasPassword
    ? [1, 1, 1]
    : [
        Math.max(0, passwordStrength - 1),
        Math.max(0, passwordStrength - 2),
        Math.max(0, passwordStrength - 3),
      ];
  const statusText = carregando
    ? "Os robozinhos juram que nao estavam olhando."
    : focusField === "senha"
      ? "Eles acompanham a senha e reagem a cada melhora."
      : focusField === "email"
        ? "A equipe robo confere se o email esta certo."
        : "A vigia do painel fica atenta, mas comportada.";

  return (
    <section className="auth-scene" data-focus={sceneFocus} aria-hidden="true">
      <div className="auth-scene-copy">
        <span className="auth-scene-kicker">Vigia do painel</span>
        <p>{statusText}</p>
      </div>

      <div className="auth-robot-stage">
        {robotMoods.map((mood, index) => (
          <article
            key={index}
            className={`auth-robot auth-robot-${index + 1} auth-robot-mood-${mood}`}
          >
            <div className="auth-robot-shadow" />
            <div className="auth-robot-antenna">
              <span />
              <span />
            </div>
            <div className="auth-robot-head">
              <div className="auth-robot-faceplate">
                <div className="auth-robot-eye">
                  <span className="auth-robot-pupil" />
                </div>
                <div className="auth-robot-eye">
                  <span className="auth-robot-pupil" />
                </div>
                <div className="auth-robot-mouth" />
              </div>
            </div>
            <div className="auth-robot-body">
              <div className="auth-robot-core" />
              <div className="auth-robot-arm auth-robot-arm-left" />
              <div className="auth-robot-arm auth-robot-arm-right" />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const lightLabel = theme === "light" ? "☀️😎 Claro" : "Claro";
  const darkLabel = theme === "dark" ? "🌙😴 Noturno" : "Noturno";

  return (
    <div className="theme-toggle" role="group" aria-label="Escolher tema">
      <button
        type="button"
        className={`theme-option ${theme === "light" ? "active" : ""}`}
        onClick={() => setTheme("light")}
      >
        {lightLabel}
      </button>
      <button
        type="button"
        className={`theme-option ${theme === "dark" ? "active" : ""}`}
        onClick={() => setTheme("dark")}
      >
        {darkLabel}
      </button>
    </div>
  );
}

function SidebarIcon({ kind }) {
  const icons = {
    consulta: (
      <path
        d="M10.5 5.5a5 5 0 1 0 0 10a5 5 0 0 0 0-10Zm0 0 5.5 5.5m-5.5 4.5 5.5 5.5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
    ),
    edicao: (
      <path
        d="m6 14.5 1.8 3.5 3.7-1.1 6.1-6.1-2.6-2.6-6.2 6.2L6 14.5Zm7.8-7.8 1.8-1.8 2.6 2.6-1.8 1.8"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
    ),
    pdfs: (
      <path
        d="M7 4.5h6l4 4v9a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-11a2 2 0 0 1 2-2Zm6 0v4h4"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
    ),
    vchhm: (
      <path
        d="M6.5 7.5h11m-11 4.5h7m-7 4.5h11m2-9-2-2m0 0-2 2m2-2v5m-14 2 2 2m0 0 2-2m-2 2v-5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
    ),
    production: (
      <path
        d="M7 5.5h10a2 2 0 0 1 2 2v9l-3-2-3 2-3-2-3 2v-9a2 2 0 0 1 2-2Zm2 4h6m-6 3h4"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
    ),
    catalog: (
      <path
        d="M5.5 6.5h13v11h-13v-11Zm4.3 0v11m4.4-11v11M5.5 10.2h13m-13 3.6h13"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
    ),
    messages: (
      <>
        <path
          d="M5.5 7.5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H11l-3.5 3v-3H7.5a2 2 0 0 1-2-2v-6Z"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.7"
        />
        <path
          d="M8.5 9.5h7m-7 3h4"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.7"
        />
      </>
    ),
  };

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {icons[kind] ?? icons.consulta}
    </svg>
  );
}

function DashboardSidebar({
  workspaceMode,
  activeModule,
  onModeChange,
  onOpenModule,
}) {
  // Keep sidebar navigation data centralized so future modules can plug in here.
  const sections = sidebarSections.map((section) => ({
    ...section,
    modules: section.moduleKeys
      .map((key) => moduleButtons.find((item) => item.key === key))
      .filter(Boolean)
      .map((module) => ({
        ...module,
        preview: modulePreviewCopy[module.key] ?? "Abrir modulo",
      })),
  }));

  return (
    <aside className="panel-card dashboard-sidebar">
      <div className="sidebar-brand">
        <span className="panel-kicker">Painel lateral</span>
        <h2>Studio de producao</h2>
      </div>

      <nav className="sidebar-nav" aria-label="Menu lateral">
        {sections.map((section) => {
          const isSectionActive = workspaceMode === section.key;

          return (
            <div
              key={section.key}
              className={`sidebar-nav-item ${isSectionActive ? "active" : ""}`}
            >
              <button
                type="button"
                className="sidebar-main-button"
                onClick={() => onModeChange(section.key)}
                aria-haspopup="true"
              >
                <span className="sidebar-icon-box">
                  <SidebarIcon kind={section.icon} />
                </span>
                <span className="sidebar-main-copy">
                  <strong>{section.label}</strong>
                  <small>{section.hint}</small>
                </span>
                <span className="sidebar-main-arrow">›</span>
              </button>

              <div className="sidebar-preview-panel">
                <span className="meta-caption">Submenus</span>
                <strong>{section.label}</strong>

                <div className="sidebar-preview-list">
                  {section.modules.map((module) => (
                    <button
                      key={module.key}
                      type="button"
                      className={`sidebar-subitem ${
                        isSectionActive && activeModule === module.key ? "active" : ""
                      }`}
                      onClick={() => onOpenModule(section.key, module.key)}
                    >
                      <span className="sidebar-subitem-icon">
                        <SidebarIcon kind={module.key} />
                      </span>
                      <span className="sidebar-subitem-copy">
                        <strong>{module.label}</strong>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </nav>

      <div className="sidebar-foot">
        <small>Passe o mouse para ver o conteudo sem precisar clicar primeiro.</small>
      </div>
    </aside>
  );
}

function PdfModule(props) {
  const {
    canEdit,
    pdfForm,
    setPdfForm,
    pdfFileInputRef,
    pdfSearch,
    setPdfSearch,
    filteredPdfs,
    onSubmit,
    onDelete,
    onEdit,
    onCancelEdit,
    showSaved,
    onToggleSaved,
  } = props;
  const [isDropActive, setIsDropActive] = useState(false);
  const hasPdfSearch = pdfSearch.trim().length > 0;
  const shouldShowResults = showSaved || hasPdfSearch;
  const selectedPdfName = pdfForm.file?.name || pdfForm.arquivoNome || "Nenhum arquivo escolhido";

  function updateSelectedPdf(file) {
    if (!file) {
      return;
    }

    setPdfForm((current) => ({
      ...current,
      file,
      arquivoNome: file.name,
    }));
  }

  function handleFileChange(event) {
    updateSelectedPdf(event.target.files?.[0] ?? null);
  }

  function handleDrop(event) {
    event.preventDefault();
    setIsDropActive(false);
    updateSelectedPdf(event.dataTransfer.files?.[0] ?? null);
  }

  return (
    <section className={`module-grid ${canEdit ? "module-grid-two" : ""}`}>
      {canEdit ? (
        <article className="panel-card">
          <div className="section-heading">
            <h2>Colocar PDF</h2>
            <p>Salve o arquivo com um nome amigavel para achar rapido depois.</p>
          </div>

          {pdfForm.id ? (
            <div className="editor-banner">
              <div>
                <strong>Editando PDF</strong>
                <span>{pdfForm.nome}</span>
              </div>
              <button type="button" className="ghost-button" onClick={onCancelEdit}>
                Cancelar edicao
              </button>
            </div>
          ) : null}

          <form className="stack-form" onSubmit={onSubmit}>
            <label className="field-block">
              <span>Nome do PDF</span>
              <input
                value={pdfForm.nome}
                onChange={(event) =>
                  setPdfForm((current) => ({ ...current, nome: event.target.value }))
                }
                placeholder="Ex.: maca de combate"
              />
            </label>

            <label className="field-block">
              <span>Arquivo PDF</span>
              <div
                className={`pdf-dropzone ${isDropActive ? "is-active" : ""}`}
                onDragOver={(event) => {
                  event.preventDefault();
                  setIsDropActive(true);
                }}
                onDragEnter={(event) => {
                  event.preventDefault();
                  setIsDropActive(true);
                }}
                onDragLeave={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget)) {
                    setIsDropActive(false);
                  }
                }}
                onDrop={handleDrop}
              >
                <input
                  ref={pdfFileInputRef}
                  className="pdf-file-input-hidden"
                  type="file"
                  accept="application/pdf"
                  onChange={handleFileChange}
                />
                <strong>Arraste e solte aqui</strong>
                <p>ou use o botao abaixo para escolher o arquivo PDF.</p>
                <button
                  type="button"
                  className="ghost-button pdf-dropzone-button"
                  onClick={() => pdfFileInputRef.current?.click()}
                >
                  Escolher arquivo
                </button>
                <small>{selectedPdfName}</small>
              </div>
            </label>

            <button type="submit" className="primary-button">
              {pdfForm.id ? "Salvar alteracoes" : "Enviar PDF"}
            </button>
          </form>

          <p className="subtle-note">
            {pdfForm.id
              ? "Se quiser, voce pode trocar o arquivo ou editar so o nome."
              : "Dica: use nomes curtos e claros para a pesquisa ficar rapida."}
          </p>
        </article>
      ) : null}

      <article className="panel-card pdf-search-card">
        <div className="section-heading">
          <h2>Pesquisa instantanea</h2>
          <p>Digite o comeco do nome e os PDFs que combinam vao aparecendo logo abaixo.</p>
        </div>

        <label className="field-block">
          <span>Pesquisar PDF</span>
          <input
            value={pdfSearch}
            onChange={(event) => setPdfSearch(event.target.value)}
            placeholder="Coloque o nome do PDFs"
          />
        </label>

        <div className="section-toolbar">
          <span className="meta-caption">{filteredPdfs.length} resultados encontrados</span>
          <button type="button" className="ghost-button" onClick={onToggleSaved}>
            {showSaved ? "Ocultar cadastrados" : "Ver PDFs cadastrados"}
          </button>
        </div>

        <div className="pdf-search-results">
          {shouldShowResults ? (
            <div className="result-list">
              {filteredPdfs.length === 0 ? (
                <p className="empty-message">Nenhum PDF encontrado para essa busca.</p>
              ) : (
                filteredPdfs.map((pdf) => (
                  <article key={pdf._id} className="result-card">
                    <div>
                      <strong>{pdf.nome}</strong>
                      <span>{pdf.arquivoNome}</span>
                    </div>

                    <div className="row-actions">
                      {canEdit ? (
                        <button
                          type="button"
                          className="small-button"
                          onClick={() => onEdit(pdf)}
                        >
                          Editar
                        </button>
                      ) : null}
                      <a
                        className="small-button"
                        href={pdf.url ?? "#"}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Abrir PDF
                      </a>
                      {canEdit ? (
                        <button
                          type="button"
                          className="small-button danger"
                          onClick={() => onDelete(pdf._id)}
                        >
                          Excluir
                        </button>
                      ) : null}
                    </div>
                  </article>
                ))
              )}
            </div>
          ) : (
            <div className="collapsed-card">
              {canEdit
                ? 'Clique em "Ver PDFs cadastrados" para listar e editar.'
                : 'Clique em "Ver PDFs cadastrados" para pesquisar e abrir.'}
            </div>
          )}
        </div>
      </article>
    </section>
  );
}

function VchhmModule(props) {
  const {
    workspace,
    vchhmForm,
    updateVchhmField,
    currentPreparationPreview,
    matchedMaterial,
    vchhmStep,
    onContinue,
    onBackToStepOne,
    onClearStepTwo,
    onCancelEdit,
    onSaveAll,
    vchhmSavedSearch,
    setVchhmSavedSearch,
    filteredVchhmGroups,
    selectedVchhmGroup,
    onOpenGroup,
    onEdit,
    onSubmit,
    onDelete,
    onClone,
    showSaved,
    onToggleSaved,
  } = props;
  const displayPreparationHour = currentPreparationPreview.valorPreparacaoHora;
  const displayPreparationValue = currentPreparationPreview.valorPreparacao;
  const visibleSelectedGroup =
    selectedVchhmGroup &&
    filteredVchhmGroups.some((group) => group.key === selectedVchhmGroup.key)
      ? selectedVchhmGroup
      : null;

  return (
    <section className="module-grid">
      <article className="panel-card">
        <div className="section-heading">
          <h2>Calcular VCHHM</h2>
          <p>
            Separe os dados fixos dos dados variaveis para preencher mais rapido e
            reaproveitar o que nao muda durante a pagina.
          </p>
        </div>

        {vchhmForm.id ? (
          <div className="editor-banner">
            <div>
              <strong>Editando linha VCHHM</strong>
              <span>
                {vchhmForm.nomeSku || vchhmForm.sku || "Sem nome"} -{" "}
                {vchhmForm.maquina || "Sem maquina"}
              </span>
            </div>
            <button
              type="button"
              className="ghost-button"
              onClick={onCancelEdit}
            >
              Cancelar edicao
            </button>
          </div>
        ) : null}

        <form className="stack-form" onSubmit={onSubmit}>
          <section className={`flow-step-card ${vchhmStep === 1 ? "is-active" : ""}`}>
            <div className="flow-step-head">
              <div>
                <span className="step-badge">Etapa 1</span>
                <h3>Dados fixos</h3>
                <p>Preencha uma vez e continue usando esses dados durante os lancamentos.</p>
              </div>
              {vchhmStep === 2 ? (
                <button type="button" className="ghost-button" onClick={onBackToStepOne}>
                  Editar etapa 1
                </button>
              ) : null}
            </div>

            {vchhmStep === 1 ? (
              <div className="grid-form">
                <label className="field-block">
                  <span>SKU</span>
                  <input
                    value={vchhmForm.sku}
                    onChange={(event) => updateVchhmField("sku", event.target.value)}
                    placeholder="SKU"
                  />
                </label>

                <label className="field-block">
                  <span>Colocar nome do produto</span>
                  <input
                    value={vchhmForm.nomeSku}
                    onChange={(event) => updateVchhmField("nomeSku", event.target.value)}
                    placeholder="Colocar nome do produto"
                  />
                </label>

                <label className="field-block">
                  <span>Material / Barra</span>
                  <input
                    value={vchhmForm.materialBarra}
                    onChange={(event) => updateVchhmField("materialBarra", event.target.value)}
                    list="material-options"
                    placeholder="BCH0044"
                  />
                </label>

                <label className="field-block">
                  <span>Tamanho por peca / material</span>
                  <input
                    value={vchhmForm.tamanhoPorPecaMaterial}
                    onChange={(event) =>
                      updateVchhmField("tamanhoPorPecaMaterial", event.target.value)
                    }
                    placeholder="Tamanho"
                  />
                </label>

                {matchedMaterial || vchhmForm.descricaoMaterial ? (
                  <div className="material-preview field-span-2">
                    <span className="meta-caption">Material encontrado</span>
                    <strong>{matchedMaterial?.codigo || vchhmForm.materialBarra || "-"}</strong>
                    <p>{matchedMaterial?.descricao || vchhmForm.descricaoMaterial || "-"}</p>
                    {matchedMaterial ? (
                      <small>Preco por KG: {formatCurrency(matchedMaterial.precoKg)}</small>
                    ) : null}
                  </div>
                ) : null}

                <div className="form-actions field-span-2">
                  <button type="button" className="primary-button" onClick={onContinue}>
                    Continuar
                  </button>
                </div>
              </div>
            ) : (
              <div className="flow-step-summary">
                <article>
                  <span>SKU</span>
                  <strong>{vchhmForm.sku || "-"}</strong>
                </article>
                <article>
                  <span>Nome do produto</span>
                  <strong>{vchhmForm.nomeSku || "-"}</strong>
                </article>
                <article>
                  <span>Material / Barra</span>
                  <strong>{vchhmForm.materialBarra || "-"}</strong>
                </article>
                <article>
                  <span>Tamanho por peca / material</span>
                  <strong>{vchhmForm.tamanhoPorPecaMaterial || "-"}</strong>
                </article>
              </div>
            )}
          </section>

          <section className={`flow-step-card ${vchhmStep === 2 ? "is-active" : ""}`}>
            <div className="flow-step-head">
              <div>
                <span className="step-badge">Etapa 2</span>
                <h3>Dados variaveis</h3>
                <p>Preencha os dados de cada lancamento e envie para a planilha.</p>
              </div>
              {vchhmStep === 2 ? (
                <button type="button" className="ghost-button" onClick={onBackToStepOne}>
                  Voltar para etapa 1
                </button>
              ) : null}
            </div>

            {vchhmStep === 2 ? (
              <div className="grid-form vchhm-step-two-grid">
                <div className="field-span-2 vchhm-step-two-fields">
                  <label className="field-block">
                    <span>Maquina</span>
                    <input
                      value={vchhmForm.maquina}
                      onChange={(event) => updateVchhmField("maquina", event.target.value)}
                      list="machine-options"
                      placeholder="Centro de torneamento"
                    />
                  </label>

                  <label className="field-block">
                    <span>Operacao</span>
                    <input
                      value={vchhmForm.operacao}
                      onChange={(event) => updateVchhmField("operacao", event.target.value)}
                      list="operation-options"
                      placeholder="Operacao"
                    />
                  </label>

                  <label className="field-block">
                    <span>Tempo de preparacao (min)</span>
                    <input
                      value={vchhmForm.tempoPreparacao}
                      onChange={(event) => updateVchhmField("tempoPreparacao", event.target.value)}
                      placeholder="90"
                    />
                  </label>

                  <label className="field-block">
                    <span>Tempo por peca (seg)</span>
                    <input
                      value={vchhmForm.tempoPorPeca}
                      onChange={(event) => updateVchhmField("tempoPorPeca", event.target.value)}
                      placeholder="25"
                    />
                  </label>

                  <label className="field-block">
                    <span>Eficiencia</span>
                    <input
                      value={vchhmForm.eficiencia}
                      onChange={(event) => updateVchhmField("eficiencia", event.target.value)}
                      placeholder="0.8"
                    />
                  </label>

                  <label className="field-block vchhm-step-wide-field">
                    <span>Programas</span>
                    <input
                      value={vchhmForm.programas}
                      onChange={(event) => updateVchhmField("programas", event.target.value)}
                      placeholder="Programa"
                    />
                  </label>

                  <label className="field-block vchhm-step-wide-field">
                    <span>Ferramentas</span>
                    <input
                      value={vchhmForm.ferramentas}
                      onChange={(event) => updateVchhmField("ferramentas", event.target.value)}
                      placeholder="Ferramentas"
                    />
                  </label>

                  <label className="field-block">
                    <span>Valor preparacao</span>
                    <input
                      value={
                        displayPreparationValue
                          ? String(roundTo(displayPreparationValue, 3)).replace(".", ",")
                          : ""
                      }
                      placeholder="Calculado pelo tempo de preparacao"
                      readOnly
                    />
                  </label>

                  <label className="field-block">
                    <span>Valor preparacao por hora</span>
                    <input
                      value={
                        displayPreparationHour
                          ? String(roundTo(displayPreparationHour, 3)).replace(".", ",")
                          : ""
                      }
                      placeholder="Calculado automaticamente"
                      readOnly
                    />
                  </label>
                </div>

                <div className="form-actions field-span-2 vchhm-step-actions">
                  <button type="submit" className="primary-button">
                    {vchhmForm.id ? "Atualizar linha" : "Enviar para planilha"}
                  </button>
                  <button type="button" className="ghost-button" onClick={onClearStepTwo}>
                    Limpar
                  </button>
                  <button type="button" className="ghost-button" onClick={onSaveAll}>
                    Salvar Tudo
                  </button>
                </div>

                <div className="summary-strip field-span-2 vchhm-preview-grid vchhm-preview-inline">
                  <article>
                    <span>Base da maquina x eficiencia</span>
                    <strong>{formatCurrency(currentPreparationPreview.baseHour)}</strong>
                  </article>
                  <article>
                    <span>Valor hora base da maquina</span>
                    <strong>{formatCurrency(currentPreparationPreview.machineRate)}</strong>
                  </article>
                  <article>
                    <span>Valor preparacao</span>
                    <strong>{formatCurrency(displayPreparationValue)}</strong>
                  </article>
                </div>
              </div>
            ) : (
              <div className="collapsed-card">
                Clique em "Continuar" para liberar a etapa 2 e registrar as linhas do VCHHM.
              </div>
            )}
          </section>
        </form>

        <div className="section-toolbar">
          <span className="meta-caption">{workspace.vchhmRows.length} linhas cadastradas</span>
          <button type="button" className="ghost-button" onClick={onToggleSaved}>
            {showSaved ? "Ocultar VCHHM cadastrado" : "Ver VCHHM cadastrado"}
          </button>
        </div>

        {showSaved ? (
          <div className="vchhm-saved-stack">
            <label className="field-block">
              <span>Pesquisar VCHHM</span>
              <input
                value={vchhmSavedSearch}
                onChange={(event) => setVchhmSavedSearch(event.target.value)}
                placeholder="Digite o nome ou SKU para localizar"
                autoComplete="off"
              />
            </label>

            {filteredVchhmGroups.length === 0 ? (
              <div className="collapsed-card">
                Nenhum VCHHM encontrado com essa busca.
              </div>
            ) : (
              <div className="vchhm-group-grid">
                {filteredVchhmGroups.map((group) => (
                  <button
                    key={group.key}
                    type="button"
                    className={`vchhm-group-card ${
                      visibleSelectedGroup?.key === group.key ? "active" : ""
                    }`}
                    onClick={() => onOpenGroup(group)}
                  >
                    <span className="meta-caption">Cadastro salvo</span>
                    <strong>{group.nomeSku || group.sku || "Sem nome do produto"}</strong>
                    <span>{group.materialBarra || group.sku || "Sem material informado"}</span>
                    <small>
                      {group.rows.length} linhas · Atualizado em{" "}
                      {formatSavedTimestamp(group.atualizadoEm)}
                    </small>
                  </button>
                ))}
              </div>
            )}

            {visibleSelectedGroup ? (
              <>
                <div className="vchhm-group-header">
                  <div>
                    <span className="meta-caption">Cadastro selecionado</span>
                    <strong>
                      {visibleSelectedGroup.nomeSku ||
                        visibleSelectedGroup.sku ||
                        "Sem nome do produto"}
                    </strong>
                    <p>{visibleSelectedGroup.materialBarra || "Sem material informado"}</p>
                  </div>
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => onOpenGroup(visibleSelectedGroup)}
                  >
                    Abrir na etapa 1
                  </button>
                </div>

                <div className="sheet-wrapper">
                  <table className="sheet-table">
                    <thead>
                      <tr>
                        <th>Nome</th>
                        <th>Maquina</th>
                        <th>Operacao</th>
                        <th>Tempo prep.</th>
                        <th>Tempo peca</th>
                        <th>Eficiencia</th>
                        <th>Valor preparacao</th>
                        <th>Valor preparacao/h</th>
                        <th>Acoes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleSelectedGroup.rows.map((row) => (
                        <tr key={row._id}>
                          <td>{row.nomeSku || row.sku}</td>
                          <td>{row.maquina}</td>
                          <td>{row.operacao}</td>
                          <td>{row.tempoPreparacao}</td>
                          <td>{row.tempoPorPeca}</td>
                          <td>{row.efficiencia}</td>
                          <td>{row.valorPreparacao}</td>
                          <td>{formatCurrency(row.valorPreparacaoHora)}</td>
                          <td>
                            <div className="row-actions">
                              <button
                                type="button"
                                className="small-button"
                                onClick={() => onEdit(row)}
                              >
                                Editar
                              </button>
                              <button
                                type="button"
                                className="small-button"
                                onClick={() => onClone(row)}
                              >
                                Clonar
                              </button>
                              <button
                                type="button"
                                className="small-button danger"
                                onClick={() => onDelete(row._id)}
                              >
                                Excluir
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <div className="collapsed-card">
                Clique em um SKU salvo para abrir a etapa 1 e revisar os lancamentos.
              </div>
            )}
          </div>
        ) : (
          <div className="collapsed-card">
            Clique em "Ver VCHHM cadastrado" para pesquisar por SKU e editar.
          </div>
        )}
      </article>
    </section>
  );
}

function ProductionModule(props) {
  const {
    canEdit,
    workspace,
    productionForm,
    setProductionForm,
    handleProductionSkuChange,
    productionMetrics,
    selectedSkuRows,
    onSubmit,
    onDelete,
    showSaved,
    onToggleSaved,
    onPrintCurrent,
    onPrintSaved,
  } = props;
  const sizePerMaterial = parseNumber(
    selectedSkuRows.find((row) => parseNumber(row.tamanhoPorPecaMaterial) > 0)
      ?.tamanhoPorPecaMaterial ?? "",
  );
  const totalMaterialMeasure = roundTo(
    sizePerMaterial * parseNumber(productionForm.quantidadeProduzir),
    3,
  );

  return (
    <section className="module-grid">
      <article className="panel-card">
        <div className="section-heading">
          <h2>Colocar dados para emitir a ficha de producao</h2>
          <p>
            Escolha o SKU ja cadastrado no VCHHM, preencha os 7 campos da
            ficha e o painel calcula tudo automaticamente.
          </p>
        </div>

        {productionForm.id ? (
          <div className="editor-banner">
            <div>
              <strong>Editando ficha</strong>
              <span>
                {productionForm.sku || "Sem SKU"} - {productionForm.numeroPedido || "Sem pedido"}
              </span>
            </div>
            {canEdit ? (
              <button
                type="button"
                className="ghost-button"
                onClick={() => setProductionForm(emptyProductionForm)}
              >
                Cancelar edicao
              </button>
            ) : null}
          </div>
        ) : null}

        <form className="grid-form" onSubmit={onSubmit}>
          <label className="field-block">
            <span>SKU</span>
            <input
              value={productionForm.sku}
              onChange={(event) => handleProductionSkuChange(event.target.value)}
              list="sku-options"
              placeholder="SKU"
            />
          </label>

          <label className="field-block">
            <span>Nome</span>
            <input
              value={productionForm.nomeSku}
              onChange={(event) =>
                setProductionForm((current) => ({
                  ...current,
                  nomeSku: event.target.value,
                }))
              }
              placeholder="Nome que quiser"
            />
          </label>

          <label className="field-block">
            <span>Quantidade a produzir</span>
            <input
              value={productionForm.quantidadeProduzir}
              onChange={(event) =>
                setProductionForm((current) => ({
                  ...current,
                  quantidadeProduzir: event.target.value,
                }))
              }
              placeholder="100"
            />
            <small className="field-note">
              Total do material: <strong>{formatMaterialMeasure(totalMaterialMeasure)}</strong>
            </small>
          </label>

          <label className="field-block">
            <span>Numero do pedido</span>
            <input
              value={productionForm.numeroPedido}
              onChange={(event) =>
                setProductionForm((current) => ({
                  ...current,
                  numeroPedido: event.target.value,
                }))
              }
              placeholder="124523"
            />
          </label>

          <label className="field-block">
            <span>Pedido</span>
            <input
              value={productionForm.pedido}
              onChange={(event) =>
                setProductionForm((current) => ({
                  ...current,
                  pedido: event.target.value,
                }))
              }
              placeholder="12/3"
            />
          </label>

          <label className="field-block">
            <span>Data prevista</span>
            <input
              value={productionForm.dataPrevista}
              onChange={(event) =>
                setProductionForm((current) => ({
                  ...current,
                  dataPrevista: event.target.value,
                }))
              }
              placeholder="12/03/2026"
            />
          </label>

          <label className="field-block">
            <span>Numero da OP</span>
            <input
              value={productionForm.numeroOp}
              onChange={(event) =>
                setProductionForm((current) => ({
                  ...current,
                  numeroOp: event.target.value,
                }))
              }
              placeholder="89"
            />
          </label>

          <label className="field-block">
            <span>Nome do cliente</span>
            <input
              value={productionForm.nomeCliente}
              onChange={(event) =>
                setProductionForm((current) => ({
                  ...current,
                  nomeCliente: event.target.value,
                }))
              }
              onBlur={() =>
                setProductionForm((current) => ({
                  ...current,
                  nomeCliente: resolveClientName(current.nomeCliente),
                }))
              }
              placeholder="Cliente"
            />
          </label>

          <label className="field-block field-span-2">
            <span>Observacao</span>
            <textarea
              value={productionForm.observacao}
              onChange={(event) =>
                setProductionForm((current) => ({
                  ...current,
                  observacao: event.target.value,
                }))
              }
              placeholder="Se precisar, escreva alguma observacao para sair na ficha."
            />
          </label>

          <div className="summary-strip field-span-2">
            <article>
              <span>Custo de preparacao</span>
              <strong>{formatCurrency(productionMetrics.totalPreparation)}</strong>
            </article>
            <article>
              <span>Valor do produto</span>
              <strong>{formatCurrency(productionMetrics.totalProduct)}</strong>
            </article>
            <article>
              <span>VCHHM</span>
              <strong>{formatCurrency(productionMetrics.totalVchhm)}</strong>
            </article>
          </div>

          <div className="form-actions field-span-2">
            <button type="submit" className="primary-button">
              {canEdit && productionForm.id ? "Atualizar ficha" : "Salvar ficha"}
            </button>
            <button type="button" className="ghost-button" onClick={onPrintCurrent}>
              Imprimir ficha
            </button>
            <button
              type="button"
              className="ghost-button"
              onClick={() => setProductionForm(emptyProductionForm)}
            >
              Limpar
            </button>
          </div>
        </form>

        <div className="sheet-wrapper">
          <table className="sheet-table">
            <thead>
              <tr>
                <th>Maquina</th>
                <th>Operacao</th>
                <th>Prep./peca</th>
                <th>Valor produto</th>
                <th>VCHHM linha</th>
              </tr>
            </thead>
            <tbody>
              {productionMetrics.lineDetails.length === 0 ? (
                <tr>
                  <td colSpan="5" className="empty-cell">
                    Escolha um SKU com linhas VCHHM para visualizar o calculo.
                  </td>
                </tr>
              ) : (
                productionMetrics.lineDetails.map((row) => (
                  <tr key={row._id}>
                    <td>{row.maquina}</td>
                    <td>{row.operacao}</td>
                    <td>{formatCurrency(row.preparationPerUnit)}</td>
                    <td>{formatCurrency(row.productUnit)}</td>
                    <td>{formatCurrency(row.total)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </article>

      <article className="panel-card">
        <div className="section-heading">
          <h2>Fichas salvas</h2>
          <p>Edite ou exclua as fichas ja emitidas sempre que precisar.</p>
        </div>

        <div className="section-toolbar">
          <span className="meta-caption">
            {workspace.productionSheets.length} fichas cadastradas
          </span>
          <button type="button" className="ghost-button" onClick={onToggleSaved}>
            {showSaved ? "Ocultar fichas" : "Ver fichas cadastradas"}
          </button>
        </div>

        {showSaved ? (
          <div className="sheet-wrapper">
            <table className="sheet-table">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Qtd.</th>
                  <th>Pedido</th>
                  <th>Data prevista</th>
                  <th>OP</th>
                  <th>Salvo em</th>
                  <th>Custo prep.</th>
                  <th>Valor produto</th>
                  <th>VCHHM</th>
                  <th>Acoes</th>
                </tr>
              </thead>
              <tbody>
                {workspace.productionSheets.length === 0 ? (
                  <tr>
                    <td colSpan="10" className="empty-cell">
                      Nenhuma ficha de producao salva ainda.
                    </td>
                  </tr>
                ) : (
                  workspace.productionSheets.map((sheet) => (
                    <tr key={sheet._id}>
                      <td>{sheet.sku}</td>
                      <td>{sheet.quantidadeProduzir}</td>
                      <td>{sheet.numeroPedido}</td>
                      <td>{sheet.dataPrevista}</td>
                      <td>{sheet.numeroOp}</td>
                      <td>{formatSavedTimestamp(sheet.atualizadoEm ?? sheet.criadoEm)}</td>
                      <td>{formatCurrency(sheet.custoPreparacao)}</td>
                      <td>{formatCurrency(sheet.valorProduto)}</td>
                      <td>{formatCurrency(sheet.vchhmTotal)}</td>
                      <td>
                        <div className="row-actions">
                          {canEdit ? (
                            <button
                              type="button"
                              className="small-button"
                              onClick={() =>
                                setProductionForm({
                                  id: sheet._id,
                                  sku: sheet.sku,
                                  nomeSku: sheet.nomeSku,
                                  quantidadeProduzir: String(sheet.quantidadeProduzir),
                                  numeroPedido: sheet.numeroPedido,
                                  pedido: sheet.pedido,
                                  dataPrevista: sheet.dataPrevista,
                                  numeroOp: sheet.numeroOp,
                                  nomeCliente: resolveClientName(sheet.nomeCliente),
                                  observacao: sheet.observacao || "",
                                })
                              }
                            >
                              Editar
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className="small-button"
                            onClick={() => onPrintSaved(sheet)}
                          >
                            Imprimir
                          </button>
                          {canEdit ? (
                            <button
                              type="button"
                              className="small-button danger"
                              onClick={() => onDelete(sheet._id)}
                            >
                              Excluir
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="collapsed-card">
            Clique em "Ver fichas cadastradas" para localizar uma ficha e editar.
          </div>
        )}
      </article>
    </section>
  );
}

function PrintModule({ draft, onBack, onPrint }) {
  const generatedAt = formatPrintTimestamp();
  const itemDescription =
    draft.rows.find((row) => row.descricaoItem?.trim())?.descricaoItem ||
    draft.nomeSku ||
    "-";
  const materialText = [draft.barras, draft.materialDescricao].filter(Boolean).join(" - ") || "-";
  const sizePerMaterial = parseNumber(
    draft.rows.find((row) => parseNumber(row.tamanhoPorPecaMaterial) > 0)?.tamanhoPorPecaMaterial ??
      "",
  );
  const totalMaterialMeasure = roundTo(
    sizePerMaterial * parseNumber(draft.quantidadeProduzir),
    3,
  );

  return (
    <section className="module-grid print-module">
      <article className="panel-card print-actions-card">
        <div className="section-heading">
          <h2>Aba de impressao</h2>
          <p>Confira a ficha, depois clique em imprimir para abrir a impressao do navegador.</p>
        </div>
        <div className="form-actions">
          <button type="button" className="ghost-button" onClick={onBack}>
            Voltar para Colocar dados
          </button>
          <button type="button" className="primary-button" onClick={onPrint}>
            Imprimir ficha
          </button>
        </div>
      </article>

      <article className="print-sheet">
        <header className="print-header">
          <div className="print-brand-block">
            <div className="print-logo-box">
              <img
                src="/usinik-industrial-logo.svg"
                alt="Usinik Usinagem Industrial"
                className="print-logo-image"
              />
            </div>
            <div>
              <p className="print-brand">Usinik</p>
              <h2>Emissao da Ficha de Producao</h2>
            </div>
          </div>
        </header>

        <section className="print-strip-table">
          <div className="print-strip-row">
            <span className="print-inline-label">Produto:</span>
            <strong>
              {draft.sku || "-"} - {itemDescription}
            </strong>
            <span className="print-inline-label">Cliente:</span>
            <strong>{resolveClientName(draft.nomeCliente)}</strong>
          </div>
          <div className="print-strip-row">
            <span className="print-inline-label">Material:</span>
            <strong>{materialText}</strong>
          </div>
        </section>

        <section className="print-mini-grid">
          <div className="print-mini-pair">
            <div>
              <span className="print-label">Pedido</span>
              <strong>{draft.numeroPedido || "-"}</strong>
            </div>
            <div>
              <span className="print-label">OP:</span>
              <strong>{draft.numeroOp || "-"}</strong>
            </div>
          </div>
          <div>
            <span className="print-label">Data prev.</span>
            <strong>{draft.dataPrevista || "-"}</strong>
          </div>
          <div>
            <span className="print-label">Item do pedido</span>
            <strong>{draft.pedido || "-"}</strong>
          </div>
          <div>
            <span className="print-label">Total material</span>
            <strong>{formatMaterialMeasure(totalMaterialMeasure)}</strong>
          </div>
          <div>
            <span className="print-label">Qtde. estoque</span>
            <strong>0</strong>
          </div>
          <div>
            <span className="print-label">Qtde. produzir</span>
            <strong>{draft.quantidadeProduzir || "0"}</strong>
          </div>
        </section>

        <table className="print-process-table">
          <colgroup>
            <col className="print-col-op" />
            <col className="print-col-machine" />
            <col className="print-col-operation" />
            <col className="print-col-description" />
            <col className="print-col-prep" />
            <col className="print-col-tpc" />
            <col className="print-col-tools" />
          </colgroup>
          <thead>
            <tr>
              <th>Op</th>
              <th>Setor/maquina</th>
              <th>Operacao</th>
              <th>Descr. operacao</th>
              <th>Prep. (min)</th>
              <th>TPC (seg)</th>
              <th>Programa / ferramentas</th>
            </tr>
          </thead>
          <tbody>
            {draft.rows.map((row, index) => (
              <tr key={row._id}>
                <td>{index}</td>
                <td>{row.maquina || "-"}</td>
                <td>{row.operacao || "-"}</td>
                <td className="print-description-cell">{row.descricao || "-"}</td>
                <td>{row.tempoPreparacao || "0"}</td>
                <td>{row.tempoPorPeca || "0"}</td>
                <td className="print-program-tools-cell">
                  <div>
                    <strong>P:</strong> <span>{row.programas || "-"}</span>
                  </div>
                  <div>
                    <strong>F:</strong> <span>{row.ferramentas || "-"}</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <section className="print-bottom-meta">
          <div className="print-meta-lines">
            <p>
              <span className="print-label-inline">Embalado por:</span>
              <strong>______________</strong>
              <span className="print-label-inline">Qtde embaladas:</span>
              <strong>____________</strong>
              <span className="print-label-inline">Qtde volumes:</span>
              <strong>______________</strong>
              <span className="print-label-inline">Data</span>
              <strong>___ / ___ / ___</strong>
              <span className="print-label-inline">Nota</span>
              <strong>________</strong>
              <span className="print-label-inline">Data da nota</span>
              <strong>___ / ___ / ___</strong>
            </p>
          </div>

          <div className="print-meta-grid print-meta-grid-secondary print-meta-grid-tertiary">
            <div>
              <span className="print-label">Data hora geracao</span>
              <strong>{generatedAt}</strong>
            </div>
            <div>
              <span className="print-label">Pagina</span>
              <strong>1 de 1 paginas</strong>
            </div>
            <div className="print-observation print-observation-inline">
              <span className="print-label">Observacao</span>
              <p>{draft.observacao || ""}</p>
            </div>
          </div>
        </section>
      </article>
    </section>
  );
}

function CatalogModule(props) {
  const {
    workspace,
    machineForm,
    setMachineForm,
    operationForm,
    setOperationForm,
    materialForm,
    setMaterialForm,
    onMachineSubmit,
    onOperationSubmit,
    onMaterialSubmit,
    onMachineDelete,
    onOperationDelete,
    onMaterialDelete,
    showMachines,
    onToggleMachines,
    showOperations,
    onToggleOperations,
    showMaterials,
    onToggleMaterials,
  } = props;

  return (
    <section className="module-grid module-grid-three">
      <article className="panel-card">
        <div className="section-heading">
          <h2>Horas maquinas</h2>
          <p>Cadastre o CÓDIGO, o nome da maquina e o valor da hora maquina.</p>
        </div>

        {machineForm.id ? (
          <div className="editor-banner">
            <div>
              <strong>Editando maquina</strong>
              <span>
                {machineForm.apelido || "Sem CÓDIGO"} - {machineForm.nomeMaquina || "Sem nome"}
              </span>
            </div>
            <button
              type="button"
              className="ghost-button"
              onClick={() => setMachineForm(emptyMachineForm)}
            >
              Cancelar edicao
            </button>
          </div>
        ) : null}

        <form className="stack-form" onSubmit={onMachineSubmit}>
          <label className="field-block">
            <span>CÓDIGO</span>
            <input
              value={machineForm.apelido}
              onChange={(event) =>
                setMachineForm((current) => ({
                  ...current,
                  apelido: event.target.value,
                }))
              }
              placeholder="TORNO01"
            />
          </label>

          <label className="field-block">
            <span>Nome da maquina</span>
            <input
              value={machineForm.nomeMaquina}
              onChange={(event) =>
                setMachineForm((current) => ({
                  ...current,
                  nomeMaquina: event.target.value,
                }))
              }
              placeholder="Centro de torneamento"
            />
          </label>

          <label className="field-block">
            <span>Valor da hora maquina</span>
            <input
              value={machineForm.valorHoraMaquina}
              onChange={(event) =>
                setMachineForm((current) => ({
                  ...current,
                  valorHoraMaquina: event.target.value,
                }))
              }
              placeholder="120"
            />
          </label>

          <div className="form-actions">
            <button type="submit" className="primary-button">
              {machineForm.id ? "Atualizar" : "Enviar"}
            </button>
            <button
              type="button"
              className="ghost-button"
              onClick={() => setMachineForm(emptyMachineForm)}
            >
              Limpar
            </button>
          </div>
        </form>

        <div className="section-toolbar">
          <span className="meta-caption">{workspace.maquinas.length} maquinas cadastradas</span>
          <button type="button" className="ghost-button" onClick={onToggleMachines}>
            {showMachines ? "Ocultar maquinas" : "Ver maquinas cadastradas"}
          </button>
        </div>

        {showMachines ? (
          <div className="result-list compact">
            {workspace.maquinas.map((machine) => (
              <article key={machine._id} className="result-card">
                <div>
                  <strong>{machine.apelido}</strong>
                  <span>
                    {machine.nomeMaquina} - {formatCurrency(machine.valorHoraMaquina)}/h
                  </span>
                </div>
                <div className="row-actions">
                  <button
                    type="button"
                    className="small-button"
                    onClick={() =>
                      setMachineForm({
                        id: machine._id,
                        apelido: machine.apelido,
                        nomeMaquina: machine.nomeMaquina,
                        valorHoraMaquina: String(machine.valorHoraMaquina),
                      })
                    }
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    className="small-button danger"
                    onClick={() => onMachineDelete(machine._id)}
                  >
                    Excluir
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="collapsed-card">
            Clique em "Ver maquinas cadastradas" para escolher uma e editar.
          </div>
        )}
      </article>

      <article className="panel-card">
        <div className="section-heading">
          <h2>Operação</h2>
          <p>Cadastre o nome da operação para reutilizar depois.</p>
        </div>

        {operationForm.id ? (
          <div className="editor-banner">
            <div>
              <strong>Editando operação</strong>
              <span>{operationForm.nomeOperacao || "Sem nome"}</span>
            </div>
            <button
              type="button"
              className="ghost-button"
              onClick={() => setOperationForm(emptyOperationForm)}
            >
              Cancelar edicao
            </button>
          </div>
        ) : null}

        <form className="stack-form" onSubmit={onOperationSubmit}>
          <label className="field-block">
            <span>Nome da operação</span>
            <input
              value={operationForm.nomeOperacao}
              onChange={(event) =>
                setOperationForm((current) => ({
                  ...current,
                  nomeOperacao: event.target.value,
                }))
              }
              placeholder="Torneamento"
            />
          </label>

          <div className="form-actions">
            <button type="submit" className="primary-button">
              {operationForm.id ? "Atualizar" : "Enviar"}
            </button>
            <button
              type="button"
              className="ghost-button"
              onClick={() => setOperationForm(emptyOperationForm)}
            >
              Limpar
            </button>
          </div>
        </form>

        <div className="section-toolbar">
          <span className="meta-caption">{workspace.operacoes.length} operacoes cadastradas</span>
          <button type="button" className="ghost-button" onClick={onToggleOperations}>
            {showOperations ? "Ocultar operacoes" : "Ver operacoes cadastradas"}
          </button>
        </div>

        {showOperations ? (
          <div className="result-list compact">
            {workspace.operacoes.map((operation) => (
              <article key={operation._id} className="result-card">
                <div>
                  <strong>{operation.nomeOperacao}</strong>
                </div>
                <div className="row-actions">
                  <button
                    type="button"
                    className="small-button"
                    onClick={() =>
                      setOperationForm({
                        id: operation._id,
                        nomeOperacao: operation.nomeOperacao,
                      })
                    }
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    className="small-button danger"
                    onClick={() => onOperationDelete(operation._id)}
                  >
                    Excluir
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="collapsed-card">
            Clique em "Ver operacoes cadastradas" para localizar e editar.
          </div>
        )}
      </article>

      <article className="panel-card">
        <div className="section-heading">
          <h2>Descricao da barra e preco por KG</h2>
          <p>Salve o codigo da barra, a descricao completa e o preco do KG.</p>
        </div>

        {materialForm.id ? (
          <div className="editor-banner">
            <div>
              <strong>Editando barra/material</strong>
              <span>
                {materialForm.codigo || "Sem codigo"} - {materialForm.descricao || "Sem descricao"}
              </span>
            </div>
            <button
              type="button"
              className="ghost-button"
              onClick={() => setMaterialForm(emptyMaterialForm)}
            >
              Cancelar edicao
            </button>
          </div>
        ) : null}

        <form className="stack-form" onSubmit={onMaterialSubmit}>
          <label className="field-block">
            <span>Codigo</span>
            <input
              value={materialForm.codigo}
              onChange={(event) =>
                setMaterialForm((current) => ({
                  ...current,
                  codigo: event.target.value,
                }))
              }
              placeholder="BCH0044"
            />
          </label>

          <label className="field-block">
            <span>Descricao</span>
            <input
              value={materialForm.descricao}
              onChange={(event) =>
                setMaterialForm((current) => ({
                  ...current,
                  descricao: event.target.value,
                }))
              }
              placeholder='BR CHATA ALUMINIO 19,05 (3/4") X 38,1'
            />
          </label>

          <label className="field-block">
            <span>Preco do KG</span>
            <input
              value={materialForm.precoKg}
              onChange={(event) =>
                setMaterialForm((current) => ({
                  ...current,
                  precoKg: event.target.value,
                }))
              }
              placeholder="1,96"
            />
          </label>

          <div className="form-actions">
            <button type="submit" className="primary-button">
              {materialForm.id ? "Atualizar" : "Enviar"}
            </button>
            <button
              type="button"
              className="ghost-button"
              onClick={() => setMaterialForm(emptyMaterialForm)}
            >
              Limpar
            </button>
          </div>
        </form>

        <div className="section-toolbar">
          <span className="meta-caption">{workspace.materiais.length} barras cadastradas</span>
          <button type="button" className="ghost-button" onClick={onToggleMaterials}>
            {showMaterials ? "Ocultar barras" : "Ver barras cadastradas"}
          </button>
        </div>

        {showMaterials ? (
          <div className="result-list compact">
            {workspace.materiais.map((material) => (
              <article key={material._id} className="result-card">
                <div>
                  <strong>{material.codigo}</strong>
                  <span>
                    {material.descricao} - {formatCurrency(material.precoKg)}/kg
                  </span>
                </div>
                <div className="row-actions">
                  <button
                    type="button"
                    className="small-button"
                    onClick={() =>
                      setMaterialForm({
                        id: material._id,
                        codigo: material.codigo,
                        descricao: material.descricao,
                        precoKg: String(material.precoKg),
                      })
                    }
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    className="small-button danger"
                    onClick={() => onMaterialDelete(material._id)}
                  >
                    Excluir
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="collapsed-card">
            Clique em "Ver barras cadastradas" para localizar e editar.
          </div>
        )}
      </article>
    </section>
  );
}

function MessagesModule(props) {
  const {
    messages,
    messagePendingCount,
    messageSearch,
    setMessageSearch,
    messageStatusFilter,
    setMessageStatusFilter,
    messageReplyDrafts,
    onReplyDraftChange,
    onReplyStart,
    onReplyConfirm,
    activeReplyId,
    sendingReplyId,
    onRefresh,
    messagesLoading,
    contactList,
    messageStats,
    messageSimForm,
    setMessageSimForm,
    onSimulateMessage,
    simulatingMessage,
    onBack,
  } = props;

  return (
    <section className="module-grid module-grid-two">
      <article className="panel-card">
        <div className="section-heading">
          <h2>Central de mensagens</h2>
          <p>
            Veja os contatos, acompanhe pendentes e responda manualmente antes de confirmar o
            envio.
          </p>
        </div>

        <div className="form-actions">
          <button type="button" className="ghost-button" onClick={onBack}>
            Voltar para a tela principal
          </button>
        </div>

        <div className="summary-strip message-summary-strip">
          <article>
            <span>Pendentes</span>
            <strong>{messagePendingCount}</strong>
          </article>
          <article>
            <span>Respondidas</span>
            <strong>{messageStats.respondidas}</strong>
          </article>
          <article>
            <span>Contatos</span>
            <strong>{contactList.length}</strong>
          </article>
        </div>

        <div className="message-toolbar">
          <label className="field-block">
            <span>Pesquisar por nome</span>
            <input
              value={messageSearch}
              onChange={(event) => setMessageSearch(event.target.value)}
              placeholder="Digite nome, telefone ou trecho da mensagem"
            />
          </label>

          <label className="field-block">
            <span>Filtrar por status</span>
            <select
              value={messageStatusFilter}
              onChange={(event) => setMessageStatusFilter(event.target.value)}
            >
              <option value="todos">Todos</option>
              <option value="pendente">Pendentes</option>
              <option value="respondido">Respondidas</option>
            </select>
          </label>

          <button type="button" className="ghost-button" onClick={onRefresh}>
            {messagesLoading ? "Atualizando..." : "Atualizar"}
          </button>
        </div>

        <div className="section-toolbar">
          <span className="meta-caption">{messages.length} mensagens carregadas</span>
          <span className="meta-caption">Atualizacao automatica a cada 5 segundos</span>
        </div>

        <div className="result-list compact">
          {messages.length === 0 ? (
            <div className="collapsed-card">
              Nenhuma mensagem recebida ainda. Use o simulador ao lado ou envie pelo webhook.
            </div>
          ) : (
            messages.map((message) => {
              const replyDraft = messageReplyDrafts[message.id] ?? message.resposta ?? "";
              const isPending = message.status === "pendente";

              return (
                <article
                  key={message.id}
                  className={`result-card message-card ${isPending ? "is-pending" : "is-responded"} ${
                    activeReplyId === message.id ? "is-active" : ""
                  }`}
                >
                  <div className="message-card-copy">
                    <div className="message-card-head">
                      <div>
                        <strong>{message.contato.nome}</strong>
                        <span>
                          {formatPhoneDisplay(message.contato.telefone)}
                          {message.contato.email ? ` • ${message.contato.email}` : ""}
                        </span>
                      </div>
                      <span className={`message-status-pill ${message.status}`}>
                        {isPending ? "Pendente" : "Respondido"}
                      </span>
                    </div>

                    <p className="message-content">{message.mensagem}</p>
                    <small>{formatSavedTimestamp(message.data_criacao)}</small>

                    <label className="field-block message-reply-field">
                      <span>Resposta manual</span>
                      <textarea
                        rows={4}
                        value={replyDraft}
                        onChange={(event) => onReplyDraftChange(message.id, event.target.value)}
                        placeholder="Digite a resposta manual aqui"
                      />
                    </label>
                  </div>

                  <div className="row-actions">
                    <button
                      type="button"
                      className="small-button"
                      onClick={() => onReplyStart(message.id)}
                    >
                      Responder
                    </button>
                    <button
                      type="button"
                      className="small-button"
                      disabled={!replyDraft.trim() || sendingReplyId === message.id}
                      onClick={() => onReplyConfirm(message.id)}
                    >
                      {sendingReplyId === message.id ? "Enviando..." : "Confirmar envio"}
                    </button>
                  </div>
                </article>
              );
            })
          )}
        </div>
      </article>

      <article className="panel-card">
        <div className="section-heading">
          <h2>Entrada simulada</h2>
          <p>
            Enquanto o WhatsApp Business API nao entra em producao, use esse formulario para
            simular novas mensagens.
          </p>
        </div>

        <form className="stack-form" onSubmit={onSimulateMessage}>
          <label className="field-block">
            <span>Nome do contato</span>
            <input
              value={messageSimForm.nome}
              onChange={(event) =>
                setMessageSimForm((current) => ({ ...current, nome: event.target.value }))
              }
              placeholder="Nome do contato"
            />
          </label>

          <label className="field-block">
            <span>Telefone</span>
            <input
              value={messageSimForm.telefone}
              onChange={(event) =>
                setMessageSimForm((current) => ({ ...current, telefone: event.target.value }))
              }
              placeholder="11999998888"
            />
          </label>

          <label className="field-block">
            <span>Email</span>
            <input
              value={messageSimForm.email}
              onChange={(event) =>
                setMessageSimForm((current) => ({ ...current, email: event.target.value }))
              }
              placeholder="contato@empresa.com"
            />
          </label>

          <label className="field-block">
            <span>Mensagem recebida</span>
            <textarea
              rows={6}
              value={messageSimForm.mensagem}
              onChange={(event) =>
                setMessageSimForm((current) => ({ ...current, mensagem: event.target.value }))
              }
              placeholder="Escreva a mensagem que chegou do cliente"
            />
          </label>

          <div className="form-actions">
            <button type="submit" className="primary-button">
              {simulatingMessage ? "Salvando..." : "Simular nova mensagem"}
            </button>
          </div>
        </form>

        <div className="section-heading message-contact-heading">
          <h2>Contatos salvos</h2>
          <p>Os contatos ficam armazenados automaticamente conforme novas mensagens chegam.</p>
        </div>

        <div className="result-list compact">
          {contactList.length === 0 ? (
            <div className="collapsed-card">Nenhum contato salvo ainda.</div>
          ) : (
            contactList.map((contact) => (
              <article key={`${contact.telefone}-${contact.email}`} className="result-card message-contact-card">
                <div>
                  <strong>{contact.nome}</strong>
                  <span>{formatPhoneDisplay(contact.telefone)}</span>
                  {contact.email ? <small>{contact.email}</small> : null}
                </div>
              </article>
            ))
          )}
        </div>
      </article>
    </section>
  );
}

function NotesModule(props) {
  const {
    annotationForm,
    setAnnotationForm,
    annotationSearch,
    setAnnotationSearch,
    filteredAnnotations,
    expandedAnnotationId,
    setExpandedAnnotationId,
    onSubmit,
  } = props;

  return (
    <section className="module-grid module-grid-two">
      <article className="panel-card">
        <div className="section-heading">
          <h2>Nova anotação</h2>
          <p>Salve observações rápidas para consultar depois sem perder informação importante.</p>
        </div>

        <form className="stack-form" onSubmit={onSubmit}>
          <label className="field-block">
            <span>Nome da anotação</span>
            <input
              value={annotationForm.nome}
              onChange={(event) =>
                setAnnotationForm((current) => ({ ...current, nome: event.target.value }))
              }
              placeholder="Ex.: Problema na máquina CNC"
            />
          </label>

          <label className="field-block">
            <span>Descrição da anotação</span>
            <textarea
              value={annotationForm.descricao}
              onChange={(event) =>
                setAnnotationForm((current) => ({
                  ...current,
                  descricao: event.target.value,
                }))
              }
              placeholder="Descreva a anotação completa"
              rows={7}
            />
          </label>

          <div className="form-actions">
            <button type="submit" className="primary-button">
              Salvar anotação
            </button>
          </div>
        </form>
      </article>

      <article className="panel-card">
        <div className="section-heading">
          <h2>Anotações salvas</h2>
          <p>Pesquise por nome ou por qualquer trecho da descrição em tempo real.</p>
        </div>

        <label className="field-block">
          <span>Pesquisar anotação</span>
          <input
            value={annotationSearch}
            onChange={(event) => setAnnotationSearch(event.target.value)}
            placeholder="Digite nome, problema, cnc, maq..."
          />
        </label>

        <div className="section-toolbar">
          <span className="meta-caption">{filteredAnnotations.length} anotacoes encontradas</span>
        </div>

        <div className="result-list compact">
          {filteredAnnotations.length === 0 ? (
            <div className="collapsed-card">
              Nenhuma anotacao encontrada. Salve uma nova anotacao ou ajuste a pesquisa.
            </div>
          ) : (
            filteredAnnotations.map((annotation) => {
              const isExpanded = expandedAnnotationId === annotation._id;

              return (
                <article key={annotation._id} className="result-card annotation-card">
                  <div className="annotation-copy">
                    <strong>{annotation.nome}</strong>
                    <span>{getDescriptionPreview(annotation.descricao)}</span>
                    <small>{formatSavedTimestamp(annotation.atualizadoEm ?? annotation.criadoEm)}</small>
                    {isExpanded ? (
                      <div className="annotation-detail">
                        <strong>Descrição completa</strong>
                        <p>{annotation.descricao}</p>
                      </div>
                    ) : null}
                  </div>

                  <div className="row-actions">
                    <button
                      type="button"
                      className="small-button"
                      onClick={() =>
                        setExpandedAnnotationId((current) =>
                          current === annotation._id ? null : annotation._id,
                        )
                      }
                    >
                      {isExpanded ? "Ocultar" : "Ver completa"}
                    </button>
                  </div>
                </article>
              );
            })
          )}
        </div>
      </article>
    </section>
  );
}

export default function App() {
  const [modo, setModo] = useState("login");
  const [authForm, setAuthForm] = useState(emptyAuthForm);
  const [authFocusField, setAuthFocusField] = useState(null);
  const [workspaceMode, setWorkspaceMode] = useState("consulta");
  const [user, setUser] = useState(null);
  const [workspace, setWorkspace] = useState(emptyWorkspace);
  const [activeModule, setActiveModule] = useState(null);
  const [authError, setAuthError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [workspaceError, setWorkspaceError] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [enviandoAuth, setEnviandoAuth] = useState(false);
  const [annotationForm, setAnnotationForm] = useState(emptyAnnotationForm);
  const [annotationSearch, setAnnotationSearch] = useState("");
  const [expandedAnnotationId, setExpandedAnnotationId] = useState(null);
  const [messagesInbox, setMessagesInbox] = useState([]);
  const [messagePendingCount, setMessagePendingCount] = useState(0);
  const [messageSearch, setMessageSearch] = useState("");
  const [messageStatusFilter, setMessageStatusFilter] = useState("todos");
  const [messageReplyDrafts, setMessageReplyDrafts] = useState({});
  const [messageSimForm, setMessageSimForm] = useState(emptyMessageSimForm);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [sendingReplyId, setSendingReplyId] = useState(null);
  const [simulatingMessage, setSimulatingMessage] = useState(false);
  const [activeReplyId, setActiveReplyId] = useState(null);
  const [pdfForm, setPdfForm] = useState(emptyPdfForm);
  const [pdfSearch, setPdfSearch] = useState("");
  const [savedPanels, setSavedPanels] = useState({
    pdfs: false,
    vchhm: false,
    production: false,
    machines: false,
    operations: false,
    materials: false,
  });
  const [machineForm, setMachineForm] = useState(emptyMachineForm);
  const [operationForm, setOperationForm] = useState(emptyOperationForm);
  const [materialForm, setMaterialForm] = useState(emptyMaterialForm);
  const [vchhmForm, setVchhmForm] = useState(emptyVchhmForm);
  const [vchhmStep, setVchhmStep] = useState(1);
  const [vchhmFixedMemory, setVchhmFixedMemory] = useState({});
  const [vchhmSavedSearch, setVchhmSavedSearch] = useState("");
  const [selectedVchhmGroupKey, setSelectedVchhmGroupKey] = useState(null);
  const [productionForm, setProductionForm] = useState(emptyProductionForm);
  const [printDraft, setPrintDraft] = useState(null);
  const sessionCheckedRef = useRef(false);
  const pendingMessageCountRef = useRef(null);
  const pdfFileInputRef = useRef(null);
  const deferredPdfSearch = useDeferredValue(pdfSearch);
  const deferredVchhmSavedSearch = useDeferredValue(vchhmSavedSearch);
  const deferredMessageSearch = useDeferredValue(messageSearch);

  const skuOptions = useMemo(() => {
    const map = new Map();
    workspace.vchhmRows.forEach((row) => {
      const key = normalizeText(row.sku ?? "");
      if (!map.has(key)) {
        map.set(key, { sku: row.sku, nomeSku: row.nomeSku });
      }
    });
    return Array.from(map.values());
  }, [workspace.vchhmRows]);

  const filteredPdfs = useMemo(() => {
    const query = normalizeText(deferredPdfSearch);
    const sorted = [...workspace.pdfs].sort((a, b) => a.searchNome.localeCompare(b.searchNome));
    if (!query) {
      return sorted.slice(0, 8);
    }

    return sorted.filter((pdf) => pdf.searchNome.startsWith(query)).slice(0, 12);
  }, [deferredPdfSearch, workspace.pdfs]);

  const currentPreparationPreview = useMemo(
    () => computePreparationPreview(vchhmForm, workspace.maquinas),
    [vchhmForm, workspace.maquinas],
  );
  const matchedMaterial = useMemo(
    () => findMaterialByCode(vchhmForm.materialBarra, workspace.materiais),
    [vchhmForm.materialBarra, workspace.materiais],
  );
  const vchhmGroups = useMemo(() => buildVchhmGroups(workspace.vchhmRows), [workspace.vchhmRows]);
  const filteredVchhmGroups = useMemo(
    () =>
      vchhmGroups.filter((group) =>
        matchesSmartSearch(`${group.sku} ${group.nomeSku}`, deferredVchhmSavedSearch),
      ),
    [deferredVchhmSavedSearch, vchhmGroups],
  );
  const selectedVchhmGroup = useMemo(
    () => vchhmGroups.find((group) => group.key === selectedVchhmGroupKey) ?? null,
    [selectedVchhmGroupKey, vchhmGroups],
  );

  const selectedSkuRows = useMemo(() => {
    const key = normalizeText(productionForm.sku);
    if (!key) return [];
    return workspace.vchhmRows.filter((row) => row.skuKey === key);
  }, [productionForm.sku, workspace.vchhmRows]);

  const productionMetrics = useMemo(
    () =>
      computeProductionMetrics(
        selectedSkuRows,
        workspace.maquinas,
        productionForm.quantidadeProduzir,
      ),
    [selectedSkuRows, workspace.maquinas, productionForm.quantidadeProduzir],
  );
  const passwordStrength = useMemo(
    () => computePasswordStrength(authForm.senha),
    [authForm.senha],
  );
  const filteredMessages = useMemo(
    () =>
      messagesInbox.filter((message) => {
        const matchesStatus =
          messageStatusFilter === "todos" || message.status === messageStatusFilter;
        const searchableText = [
          message.contato?.nome,
          message.contato?.telefone,
          message.contato?.email,
          message.mensagem,
        ]
          .filter(Boolean)
          .join(" ");

        return matchesStatus && matchesSmartSearch(searchableText, deferredMessageSearch);
      }),
    [deferredMessageSearch, messageStatusFilter, messagesInbox],
  );
  const messageStats = useMemo(
    () => ({
      pendentes: messagesInbox.filter((message) => message.status === "pendente").length,
      respondidas: messagesInbox.filter((message) => message.status === "respondido").length,
    }),
    [messagesInbox],
  );
  const contactList = useMemo(() => {
    const uniqueContacts = new Map();

    messagesInbox.forEach((message) => {
      if (!message.contato) {
        return;
      }

      const key = message.contato.telefone || `${message.contato.nome}-${message.contato.email}`;
      if (!uniqueContacts.has(key)) {
        uniqueContacts.set(key, message.contato);
      }
    });

    return Array.from(uniqueContacts.values());
  }, [messagesInbox]);
  const selectedModule = useMemo(() => {
    if (activeModule === "print") {
      return { label: "Impressao" };
    }

    if (activeModule === "messages") {
      return { label: "Mensagens" };
    }

    if (activeModule === "notes") {
      return { label: "Anotações" };
    }

    return moduleButtons.find((item) => item.key === activeModule) ?? null;
  }, [activeModule]);
  const homeStats = useMemo(
    () => [
      { label: "salvas de PDFs", value: workspace.pdfs.length },
      { label: "Fichas de produção", value: workspace.productionSheets.length },
      {
        label: "Base de cadastros",
        value: workspace.maquinas.length + workspace.operacoes.length + workspace.materiais.length,
      },
    ],
    [workspace],
  );
  const currentWorkspaceSummary = useMemo(
    () =>
      workspaceMode === "edicao"
        ? {
            kicker: "Modo edicao",
            title: "Edicao",
            description:
              "Cadastre, ajuste e mantenha tudo organizado. Passe o mouse na sidebar para abrir os submenus.",
          }
        : {
            kicker: "Modo consulta",
            title: "Consulta de dados",
            description:
              "Pesquise PDFs e emita fichas com foco total. Passe o mouse na sidebar para ver os atalhos.",
          },
    [workspaceMode],
  );
  const dashboardHeadline = activeModule
    ? selectedModule?.label ?? currentWorkspaceSummary.title
    : currentWorkspaceSummary.title;
  const filteredAnnotations = useMemo(
    () =>
      workspace.anotacoes.filter((annotation) =>
        matchesSmartSearch(`${annotation.nome} ${annotation.descricao}`, annotationSearch),
      ),
    [annotationSearch, workspace.anotacoes],
  );

  async function refreshWorkspace(successMessage) {
    try {
      const data = await apiFetch("/api/workspace");
      setWorkspace(data);
      setWorkspaceError("");
      if (successMessage) {
        setFeedback(successMessage);
      }
    } catch (error) {
      setWorkspaceError(error.message);
    }
  }

  function syncMessageReplyDrafts(nextMessages) {
    setMessageReplyDrafts((current) => {
      const nextDrafts = {};

      nextMessages.forEach((message) => {
        nextDrafts[message.id] = current[message.id] ?? message.resposta ?? "";
      });

      return nextDrafts;
    });
  }

  async function refreshPendingMessages({ silent = true } = {}) {
    try {
      const data = await messagesApiFetch("/api/mensagens/pendentes");
      const nextPending = Number(data.pendentes ?? 0);

      if (
        pendingMessageCountRef.current !== null &&
        nextPending > pendingMessageCountRef.current
      ) {
        playNotificationTone();
      }

      pendingMessageCountRef.current = nextPending;
      setMessagePendingCount(nextPending);
    } catch (error) {
      if (!silent) {
        setWorkspaceError(error.message);
      }
    }
  }

  async function refreshMessages({ silent = false } = {}) {
    if (!silent) {
      setMessagesLoading(true);
    }

    try {
      const data = await messagesApiFetch("/api/mensagens");
      const nextMessages = Array.isArray(data.mensagens) ? data.mensagens : [];

      setMessagesInbox(nextMessages);
      syncMessageReplyDrafts(nextMessages);
      setMessagePendingCount(nextMessages.filter((message) => message.status === "pendente").length);
      if (!silent) {
        setWorkspaceError("");
      }
    } catch (error) {
      if (!silent) {
        setWorkspaceError(error.message);
      }
    } finally {
      if (!silent) {
        setMessagesLoading(false);
      }
    }
  }

  const pollPendingMessages = useEffectEvent(() => {
    refreshPendingMessages();
  });

  const pollInboxMessages = useEffectEvent((silent = false) => {
    refreshMessages({ silent });
  });

  useEffect(() => {
    if (sessionCheckedRef.current) {
      return;
    }

    sessionCheckedRef.current = true;
    async function carregarSessaoInicial() {
      const token = localStorage.getItem(storageKey);
      if (!token) {
        setCarregando(false);
        return;
      }

      try {
        const data = await apiFetch("/api/auth/me");
        setUser(data.user);
        await refreshWorkspace();
      } catch (error) {
        localStorage.removeItem(storageKey);
        setWorkspaceError(error.message);
      } finally {
        setCarregando(false);
      }
    }

    carregarSessaoInicial();
  }, []);

  useEffect(() => {
    if (workspaceMode === "consulta") {
      if (activeModule === "vchhm" || activeModule === "catalog") {
        setActiveModule(null);
      }

      setPdfForm((current) => (current.id ? emptyPdfForm : current));
      setProductionForm((current) => (current.id ? emptyProductionForm : current));
    }
  }, [activeModule, workspaceMode]);

  useEffect(() => {
    if (!user) {
      pendingMessageCountRef.current = null;
      setMessagesInbox([]);
      setMessagePendingCount(0);
      return;
    }

    pollPendingMessages();
    const intervalId = window.setInterval(() => {
      pollPendingMessages();
    }, 5000);

    return () => window.clearInterval(intervalId);
  }, [user]);

  useEffect(() => {
    if (!user || activeModule !== "messages") {
      return;
    }

    pollInboxMessages();
    const intervalId = window.setInterval(() => {
      pollInboxMessages(true);
    }, 5000);

    return () => window.clearInterval(intervalId);
  }, [activeModule, user]);

  useEffect(() => {
    if (
      selectedVchhmGroupKey &&
      !vchhmGroups.some((group) => group.key === selectedVchhmGroupKey)
    ) {
      setSelectedVchhmGroupKey(null);
    }
  }, [selectedVchhmGroupKey, vchhmGroups]);

  function handleMessageReplyDraftChange(messageId, value) {
    setMessageReplyDrafts((current) => ({
      ...current,
      [messageId]: value,
    }));
  }

  function handleMessageReplyStart(messageId) {
    setActiveReplyId(messageId);
  }

  async function handleMessageReplyConfirm(messageId) {
    const resposta = String(messageReplyDrafts[messageId] ?? "").trim();
    if (!resposta) {
      setWorkspaceError("Digite a resposta antes de confirmar o envio.");
      return;
    }

    setSendingReplyId(messageId);
    try {
      const data = await messagesApiFetch("/api/responder", {
        method: "POST",
        body: JSON.stringify({ id: messageId, resposta }),
      });
      const nextMessages = Array.isArray(data.mensagens) ? data.mensagens : [];

      setMessagesInbox(nextMessages);
      syncMessageReplyDrafts(nextMessages);
      setMessagePendingCount(Number(data.pendentes ?? 0));
      setFeedback("Mensagem enviada e marcada como respondida.");
      setWorkspaceError("");
    } catch (error) {
      setWorkspaceError(error.message);
    } finally {
      setSendingReplyId(null);
    }
  }

  async function handleSimulateMessage(event) {
    event.preventDefault();
    if (!messageSimForm.telefone.trim() || !messageSimForm.mensagem.trim()) {
      setWorkspaceError("Preencha pelo menos telefone e mensagem para simular.");
      return;
    }

    setSimulatingMessage(true);
    try {
      const data = await messagesApiFetch("/api/mensagens", {
        method: "POST",
        body: JSON.stringify(messageSimForm),
      });
      const nextMessages = Array.isArray(data.mensagens) ? data.mensagens : [];

      setMessagesInbox(nextMessages);
      syncMessageReplyDrafts(nextMessages);
      setMessagePendingCount(Number(data.pendentes ?? 0));
      setMessageSimForm(emptyMessageSimForm);
      setFeedback("Mensagem recebida e salva na central.");
      setWorkspaceError("");
    } catch (error) {
      setWorkspaceError(error.message);
    } finally {
      setSimulatingMessage(false);
    }
  }

  async function handleAuthSubmit(event) {
    event.preventDefault();
    setEnviandoAuth(true);
    setAuthError("");
    setAuthFocusField(null);

    try {
      const path = modo === "cadastro" ? "/api/auth/register" : "/api/auth/login";
      const payload =
        modo === "cadastro"
          ? authForm
          : { email: authForm.email, senha: authForm.senha };

      const data = await apiFetch(path, {
        method: "POST",
        body: JSON.stringify(payload),
      });

      localStorage.setItem(storageKey, data.token);
      setUser(data.user);
      setAuthForm(emptyAuthForm);
      setAuthFocusField(null);
      await refreshWorkspace(`Bem-vindo, ${data.user.nome}.`);
    } catch (error) {
      setAuthError(error.message);
    } finally {
      setEnviandoAuth(false);
      setCarregando(false);
    }
  }

  async function handleLogout() {
    try {
      await apiFetch("/api/auth/logout", { method: "POST" });
    } catch {
      // Ignore logout failures and clear local session anyway.
    }

    localStorage.removeItem(storageKey);
    setUser(null);
    setWorkspace(emptyWorkspace);
    setWorkspaceMode("consulta");
    setFeedback("Sessao encerrada.");
    setWorkspaceError("");
    setAnnotationForm(emptyAnnotationForm);
    setAnnotationSearch("");
    setExpandedAnnotationId(null);
    setMessagesInbox([]);
    setMessagePendingCount(0);
    setMessageSearch("");
    setMessageStatusFilter("todos");
    setMessageReplyDrafts({});
    setMessageSimForm(emptyMessageSimForm);
    setMessagesLoading(false);
    setSendingReplyId(null);
    setSimulatingMessage(false);
    setActiveReplyId(null);
    setPdfForm(emptyPdfForm);
    setMachineForm(emptyMachineForm);
    setOperationForm(emptyOperationForm);
    setMaterialForm(emptyMaterialForm);
    setVchhmForm(emptyVchhmForm);
    setVchhmStep(1);
    setVchhmFixedMemory({});
    setVchhmSavedSearch("");
    setSelectedVchhmGroupKey(null);
    setProductionForm(emptyProductionForm);
    setPrintDraft(null);
    setActiveModule(null);
    setSavedPanels({
      pdfs: false,
      vchhm: false,
      production: false,
      machines: false,
      operations: false,
      materials: false,
    });
    pendingMessageCountRef.current = null;
  }

  function toggleSavedPanel(key) {
    setSavedPanels((current) => ({
      ...current,
      [key]: !current[key],
    }));
  }

  async function handlePdfSubmit(event) {
    event.preventDefault();
    if (!pdfForm.nome.trim()) {
      setWorkspaceError("Diga o nome do PDF para salvar.");
      return;
    }

    if (!pdfForm.id && !pdfForm.file) {
      setWorkspaceError("Selecione um arquivo PDF para salvar.");
      return;
    }

    const formData = new FormData();
    if (pdfForm.id) {
      formData.append("id", pdfForm.id);
    }
    formData.append("nome", pdfForm.nome);
    if (pdfForm.file) {
      formData.append("file", pdfForm.file);
    }

    try {
      const data = await apiFetch("/api/pdfs/upload", {
        method: "POST",
        body: formData,
      });
      setWorkspace(data);
      setPdfForm(emptyPdfForm);
      setSavedPanels((current) => ({ ...current, pdfs: true }));
      if (pdfFileInputRef.current) {
        pdfFileInputRef.current.value = "";
      }
      setWorkspaceError("");
      setFeedback("PDF salvo com sucesso.");
    } catch (error) {
      setWorkspaceError(error.message);
    }
  }

  async function handlePdfDelete(id) {
    try {
      const data = await apiFetch("/api/pdfs/delete", {
        method: "POST",
        body: JSON.stringify({ id }),
      });
      setWorkspace(data);
      if (pdfForm.id === id) {
        setPdfForm(emptyPdfForm);
      }
      setFeedback("PDF excluido.");
      setWorkspaceError("");
    } catch (error) {
      setWorkspaceError(error.message);
    }
  }

  async function handleMachineSubmit(event) {
    event.preventDefault();
    try {
      const payload = {
        apelido: machineForm.apelido,
        nomeMaquina: machineForm.nomeMaquina,
        valorHoraMaquina: parseNumber(machineForm.valorHoraMaquina),
      };

      if (machineForm.id) {
        payload.id = machineForm.id;
      }

      const data = await apiFetch("/api/maquinas/upsert", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setWorkspace(data);
      setMachineForm(emptyMachineForm);
      setSavedPanels((current) => ({ ...current, machines: true }));
      setFeedback("Cadastro de maquina salvo.");
      setWorkspaceError("");
    } catch (error) {
      setWorkspaceError(error.message);
    }
  }

  async function handleOperationSubmit(event) {
    event.preventDefault();
    try {
      const payload = {
        nomeOperacao: operationForm.nomeOperacao,
      };

      if (operationForm.id) {
        payload.id = operationForm.id;
      }

      const data = await apiFetch("/api/operacoes/upsert", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setWorkspace(data);
      setOperationForm(emptyOperationForm);
      setSavedPanels((current) => ({ ...current, operations: true }));
      setFeedback("Cadastro de operacao salvo.");
      setWorkspaceError("");
    } catch (error) {
      setWorkspaceError(error.message);
    }
  }

  async function handleMaterialSubmit(event) {
    event.preventDefault();
    try {
      const payload = {
        codigo: materialForm.codigo,
        descricao: materialForm.descricao,
        precoKg: parseNumber(materialForm.precoKg),
      };

      if (materialForm.id) {
        payload.id = materialForm.id;
      }

      const data = await apiFetch("/api/materiais/upsert", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setWorkspace(data);
      setMaterialForm(emptyMaterialForm);
      setSavedPanels((current) => ({ ...current, materials: true }));
      setFeedback("Cadastro de barra/material salvo.");
      setWorkspaceError("");
    } catch (error) {
      setWorkspaceError(error.message);
    }
  }

  async function handleAnnotationSubmit(event) {
    event.preventDefault();

    if (!annotationForm.nome.trim() || !annotationForm.descricao.trim()) {
      setWorkspaceError("Preencha nome e descricao da anotacao.");
      return;
    }

    try {
      const data = await apiFetch("/api/anotacoes/upsert", {
        method: "POST",
        body: JSON.stringify({
          nome: annotationForm.nome,
          descricao: annotationForm.descricao,
        }),
      });
      setWorkspace(data);
      setAnnotationForm(emptyAnnotationForm);
      setExpandedAnnotationId(data.anotacoes[0]?._id ?? null);
      setFeedback("Anotacao salva com sucesso.");
      setWorkspaceError("");
    } catch (error) {
      setWorkspaceError(error.message);
    }
  }

  function updateVchhmField(field, value) {
    setVchhmForm((current) => {
      const next = { ...current, [field]: value };

      if (field === "materialBarra") {
        const material = findMaterialByCode(value, workspace.materiais);
        next.descricaoMaterial = material ? material.descricao : "";
      }

      if (field === "sku") {
        const option = skuOptions.find((item) => normalizeText(item.sku) === normalizeText(value));
        if (option && !current.nomeSku) {
          next.nomeSku = option.nomeSku;
        }
      }

      if (
        field === "nomeSku" &&
        (!current.sku.trim() || normalizeText(current.sku) === normalizeText(current.nomeSku))
      ) {
        next.sku = value;
      }

      return next;
    });
  }

  function rememberVchhmFixedData(formLike) {
    const key = normalizeText(formLike.sku || formLike.nomeSku);
    if (!key) {
      return;
    }

    setVchhmFixedMemory((current) => ({
      ...current,
      [key]: {
        sku: formLike.sku || formLike.nomeSku,
        nomeSku: formLike.nomeSku,
        materialBarra: formLike.materialBarra,
        descricaoMaterial: formLike.descricaoMaterial,
        tamanhoPorPecaMaterial: formLike.tamanhoPorPecaMaterial,
      },
    }));
  }

  function handleContinueVchhmStep() {
    if (
      !vchhmForm.sku.trim() ||
      !vchhmForm.nomeSku.trim() ||
      !vchhmForm.materialBarra.trim() ||
      !vchhmForm.tamanhoPorPecaMaterial.trim()
    ) {
      setWorkspaceError("Preencha os 4 campos dos dados fixos antes de continuar.");
      return;
    }

    rememberVchhmFixedData(vchhmForm);
    setVchhmStep(2);
    setWorkspaceError("");
  }

  function handleResetVchhmSession() {
    setVchhmForm(emptyVchhmForm);
    setVchhmStep(1);
  }

  function handleOpenVchhmGroup(group) {
    if (!group?.rows?.length) {
      return;
    }

    const [firstRow] = group.rows;
    const memory = vchhmFixedMemory[group.key] ?? {};
    setSelectedVchhmGroupKey(group.key);
    setVchhmForm({
      ...emptyVchhmForm,
      nomeSku: memory.nomeSku || firstRow.nomeSku,
      sku: memory.sku || firstRow.sku,
      materialBarra: memory.materialBarra || firstRow.materialBarra,
      descricaoMaterial: memory.descricaoMaterial || firstRow.descricaoMaterial,
      tamanhoPorPecaMaterial:
        memory.tamanhoPorPecaMaterial || firstRow.tamanhoPorPecaMaterial,
    });
    setVchhmStep(1);
    setFeedback(`Cadastro ${group.nomeSku || group.sku || "sem nome"} carregado para revisao.`);
    setWorkspaceError("");
  }

  function handleEditVchhmRow(row) {
    setSelectedVchhmGroupKey(row.skuKey || normalizeText(row.sku));
    setVchhmForm(mapVchhmRowToForm(row));
    setVchhmStep(2);
    setFeedback("Linha carregada no formulario para edicao.");
    setWorkspaceError("");
  }

  function handleCloneVchhmRow(row) {
    setSelectedVchhmGroupKey(row.skuKey || normalizeText(row.sku));
    setVchhmForm(mapVchhmRowToForm(row, { clone: true }));
    setVchhmStep(2);
    setFeedback("Linha clonada no formulario. Ajuste o processo e salve.");
    setWorkspaceError("");
  }

  function handleVchhmSaveAll() {
    if (!workspace.vchhmRows.length) {
      setWorkspaceError("Envie pelo menos uma linha para a planilha antes de salvar tudo.");
      return;
    }

    if ((vchhmForm.sku || vchhmForm.nomeSku).trim()) {
      setSelectedVchhmGroupKey(normalizeText(vchhmForm.sku || vchhmForm.nomeSku));
    }

    setSavedPanels((current) => ({ ...current, vchhm: true }));
    setVchhmStep(1);
    setVchhmSavedSearch("");
    setFeedback("Cadastro VCHHM finalizado.");
    setWorkspaceError("");
    setVchhmForm(emptyVchhmForm);
  }

  async function handleVchhmSubmit(event) {
    event.preventDefault();
    if (
      !vchhmForm.sku.trim() ||
      !vchhmForm.nomeSku.trim() ||
      !vchhmForm.materialBarra.trim() ||
      !vchhmForm.tamanhoPorPecaMaterial.trim()
    ) {
      setWorkspaceError("Preencha os dados fixos antes de salvar uma linha.");
      setVchhmStep(1);
      return;
    }

    if (
      !vchhmForm.maquina.trim() ||
      !vchhmForm.operacao.trim() ||
      !vchhmForm.tempoPreparacao.trim() ||
      !vchhmForm.tempoPorPeca.trim() ||
      !vchhmForm.eficiencia.trim()
    ) {
      setWorkspaceError("Preencha todos os campos da etapa 2 antes de enviar para a planilha.");
      return;
    }

    try {
      const skuValue = vchhmForm.sku.trim() || vchhmForm.nomeSku.trim();
      rememberVchhmFixedData({ ...vchhmForm, sku: skuValue });
      const payload = {
        sku: skuValue,
        nomeSku: vchhmForm.nomeSku,
        maquina: vchhmForm.maquina,
        operacao: vchhmForm.operacao,
        descricao: vchhmForm.descricao || vchhmForm.operacao,
        tempoPreparacao: parseNumber(vchhmForm.tempoPreparacao),
        tempoPorPeca: parseNumber(vchhmForm.tempoPorPeca),
        eficiencia: currentPreparationPreview.efficiency,
        valorPreparacao: currentPreparationPreview.valorPreparacao,
        valorPreparacaoHora: currentPreparationPreview.valorPreparacaoHora,
        materialBarra: vchhmForm.materialBarra,
        descricaoMaterial: vchhmForm.descricaoMaterial,
        tamanhoPorPecaMaterial: vchhmForm.tamanhoPorPecaMaterial,
        descricaoItem: "",
        programas: vchhmForm.programas,
        ferramentas: vchhmForm.ferramentas,
      };

      if (vchhmForm.id) {
        payload.id = vchhmForm.id;
      }

      const data = await apiFetch("/api/vchhm/upsert", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setWorkspace(data);
      setSelectedVchhmGroupKey(normalizeText(skuValue));
      setVchhmForm((current) => ({
        ...resetVchhmDynamicFields(current),
        sku: skuValue,
      }));
      setVchhmStep(2);
      setSavedPanels((current) => ({ ...current, vchhm: true }));
      setFeedback("Linha VCHHM salva na mini planilha.");
      setWorkspaceError("");
    } catch (error) {
      setWorkspaceError(error.message);
    }
  }

  function handleProductionSkuChange(value) {
    setProductionForm((current) => {
      const option = skuOptions.find((item) => normalizeText(item.sku) === normalizeText(value));
      return {
        ...current,
        sku: value,
        nomeSku: option ? option.nomeSku : current.nomeSku,
      };
    });
  }

  async function handleProductionSubmit(event) {
    event.preventDefault();
    try {
      const payload = {
        sku: productionForm.sku,
        nomeSku: productionForm.nomeSku,
        quantidadeProduzir: parseNumber(productionForm.quantidadeProduzir),
        numeroPedido: productionForm.numeroPedido,
        pedido: productionForm.pedido,
        dataPrevista: productionForm.dataPrevista,
        numeroOp: productionForm.numeroOp,
        nomeCliente: resolveClientName(productionForm.nomeCliente),
        observacao: productionForm.observacao.trim(),
        custoPreparacao: productionMetrics.totalPreparation,
        valorProduto: productionMetrics.totalProduct,
        vchhmTotal: productionMetrics.totalVchhm,
      };

      if (productionForm.id) {
        payload.id = productionForm.id;
      }

      const data = await apiFetch("/api/fichas/upsert", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setWorkspace(data);
      setProductionForm(emptyProductionForm);
      setSavedPanels((current) => ({ ...current, production: true }));
      setFeedback("Ficha de producao salva.");
      setWorkspaceError("");
    } catch (error) {
      setWorkspaceError(error.message);
    }
  }

  function openPrintView(sheet, rows) {
    if (!sheet.sku?.trim()) {
      setWorkspaceError("Escolha um SKU antes de abrir a impressao.");
      return;
    }

    if (!rows.length) {
      setWorkspaceError("Esse SKU ainda nao tem linhas VCHHM para montar a ficha.");
      return;
    }

    setPrintDraft(buildPrintDraft(sheet, rows));
    setWorkspaceError("");
    setFeedback("Ficha pronta para impressao.");
    setActiveModule("print");
  }

  async function deleteCollectionItem(path, id, successMessage) {
    try {
      const data = await apiFetch(path, {
        method: "POST",
        body: JSON.stringify({ id }),
      });
      setWorkspace(data);
      setFeedback(successMessage);
      setWorkspaceError("");
    } catch (error) {
      setWorkspaceError(error.message);
    }
  }

  if (carregando && !user) {
    return (
      <main className="screen-center notranslate" translate="no">
        <section className="auth-panel">
          <div className="panel-kicker">Carregando</div>
          <h1>Preparando o painel</h1>
          <p className="panel-copy">Verificando sua sessao e carregando o workspace.</p>
        </section>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="screen-center notranslate" translate="no">
        <div className="screen-topbar auth-screen-topbar">
          <ThemeToggle />
        </div>
        <section className="auth-stage">
          <AuthForm
            modo={modo}
            onSubmit={handleAuthSubmit}
            carregando={enviandoAuth}
            erro={authError}
            alternarModo={() => {
              setAuthError("");
              setAuthFocusField(null);
              setModo((current) => (current === "login" ? "cadastro" : "login"));
            }}
            form={authForm}
            setForm={setAuthForm}
            onFieldFocus={setAuthFocusField}
            onFieldBlur={(event) => {
              if (!event.currentTarget.form?.contains(event.relatedTarget)) {
                setAuthFocusField(null);
              }
            }}
          />
          <AuthRobotScene
            focusField={authFocusField}
            passwordStrength={passwordStrength}
            hasPassword={Boolean(authForm.senha)}
            carregando={enviandoAuth}
          />
        </section>
      </main>
    );
  }

  return (
    <main className="dashboard-shell notranslate" translate="no">
      <div className="dashboard-layout">
        <DashboardSidebar
          workspaceMode={workspaceMode}
          activeModule={activeModule}
          onModeChange={(nextMode) => {
            setWorkspaceMode(nextMode);
            setActiveModule(null);
          }}
          onOpenModule={(nextMode, moduleKey) => {
            setWorkspaceMode(nextMode);
            setActiveModule(moduleKey);
          }}
        />

        <section className="dashboard-content">
          <header className="panel-card dashboard-topbar">
            <div className="dashboard-topbar-copy">
              <span className="panel-kicker">{currentWorkspaceSummary.kicker}</span>
              <h1>{dashboardHeadline}</h1>
            </div>

            <div className="dashboard-topbar-actions">
              <div className="user-badge">
                <span>{user.nome}</span>
                <small>{user.email}</small>
              </div>
              <div className="hero-controls">
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => setActiveModule("notes")}
                >
                  Anotacoes
                </button>
                <ThemeToggle />
                <button type="button" className="ghost-button" onClick={handleLogout}>
                  Sair
                </button>
              </div>
            </div>
          </header>

      {!activeModule ? (
        <section className="hero-card home-panel dashboard-home-panel">
          <div className="dashboard-home-copy">
            <span className="panel-kicker">Acesso rapido</span>
            <h2>{currentWorkspaceSummary.title}</h2>
            {/*
              Os modulos continuam funcionando como antes. Agora voce tambem pode
                Anotações
            */}
          </div>

          <div className="home-grid">
            <div className="stats-stack">
              {homeStats.map((stat) => (
                <article key={stat.label} className="stat-card home-stat-card">
                  <span>{stat.label}</span>
                  <strong>{stat.value}</strong>
                </article>
              ))}
            </div>

          </div>
        </section>
      ) : null}

      {activeModule ? (
        <section className="module-focus-bar">
          <button type="button" className="ghost-button" onClick={() => setActiveModule(null)}>
            Voltar
          </button>
          <div className="module-focus-title">
            <span>Modulo ativo</span>
            <strong>{selectedModule?.label}</strong>
          </div>
        </section>
      ) : null}

      {feedback ? <p className="feedback success">{feedback}</p> : null}
      {workspaceError ? <p className="feedback error">{workspaceError}</p> : null}

      {activeModule === "pdfs" ? (
        <PdfModule
          canEdit={workspaceMode === "edicao"}
          pdfForm={pdfForm}
          setPdfForm={setPdfForm}
          pdfFileInputRef={pdfFileInputRef}
          pdfSearch={pdfSearch}
          setPdfSearch={setPdfSearch}
          filteredPdfs={filteredPdfs}
          onSubmit={handlePdfSubmit}
          onDelete={handlePdfDelete}
          showSaved={savedPanels.pdfs}
          onToggleSaved={() => toggleSavedPanel("pdfs")}
          onEdit={(pdf) =>
            setPdfForm({
              id: pdf._id,
              nome: pdf.nome,
              file: null,
              arquivoNome: pdf.arquivoNome,
            })
          }
          onCancelEdit={() => {
            setPdfForm(emptyPdfForm);
            if (pdfFileInputRef.current) {
              pdfFileInputRef.current.value = "";
            }
          }}
        />
      ) : null}

      {activeModule === "vchhm" ? (
        <VchhmModule
          workspace={workspace}
          vchhmForm={vchhmForm}
          updateVchhmField={updateVchhmField}
          currentPreparationPreview={currentPreparationPreview}
          matchedMaterial={matchedMaterial}
          vchhmStep={vchhmStep}
          onContinue={handleContinueVchhmStep}
          onBackToStepOne={() => setVchhmStep(1)}
          onClearStepTwo={() => setVchhmForm((current) => resetVchhmDynamicFields(current))}
          onCancelEdit={handleResetVchhmSession}
          onSaveAll={handleVchhmSaveAll}
          vchhmSavedSearch={vchhmSavedSearch}
          setVchhmSavedSearch={setVchhmSavedSearch}
          filteredVchhmGroups={filteredVchhmGroups}
          selectedVchhmGroup={selectedVchhmGroup}
          onOpenGroup={handleOpenVchhmGroup}
          onEdit={handleEditVchhmRow}
          onSubmit={handleVchhmSubmit}
          onClone={handleCloneVchhmRow}
          showSaved={savedPanels.vchhm}
          onToggleSaved={() => toggleSavedPanel("vchhm")}
          onDelete={(id) =>
            deleteCollectionItem("/api/vchhm/delete", id, "Linha VCHHM excluida.")
          }
        />
      ) : null}

      {activeModule === "production" ? (
        <ProductionModule
          canEdit={workspaceMode === "edicao"}
          workspace={workspace}
          productionForm={productionForm}
          setProductionForm={setProductionForm}
          handleProductionSkuChange={handleProductionSkuChange}
          productionMetrics={productionMetrics}
          selectedSkuRows={selectedSkuRows}
          onSubmit={handleProductionSubmit}
          showSaved={savedPanels.production}
          onToggleSaved={() => toggleSavedPanel("production")}
          onPrintCurrent={() =>
            openPrintView(
              {
                ...productionForm,
                nomeCliente: resolveClientName(productionForm.nomeCliente),
                custoPreparacao: productionMetrics.totalPreparation,
                valorProduto: productionMetrics.totalProduct,
                vchhmTotal: productionMetrics.totalVchhm,
              },
              selectedSkuRows,
            )
          }
          onPrintSaved={(sheet) =>
            openPrintView(
              sheet,
              workspace.vchhmRows.filter(
                (row) =>
                  row.skuKey === sheet.skuKey ||
                  normalizeText(row.sku) === normalizeText(sheet.sku),
              ),
            )
          }
          onDelete={(id) =>
            deleteCollectionItem("/api/fichas/delete", id, "Ficha de producao excluida.")
          }
        />
      ) : null}

      {activeModule === "catalog" ? (
        <CatalogModule
          workspace={workspace}
          machineForm={machineForm}
          setMachineForm={setMachineForm}
          operationForm={operationForm}
          setOperationForm={setOperationForm}
          materialForm={materialForm}
          setMaterialForm={setMaterialForm}
          onMachineSubmit={handleMachineSubmit}
          onOperationSubmit={handleOperationSubmit}
          onMaterialSubmit={handleMaterialSubmit}
          showMachines={savedPanels.machines}
          onToggleMachines={() => toggleSavedPanel("machines")}
          showOperations={savedPanels.operations}
          onToggleOperations={() => toggleSavedPanel("operations")}
          showMaterials={savedPanels.materials}
          onToggleMaterials={() => toggleSavedPanel("materials")}
          onMachineDelete={(id) =>
            deleteCollectionItem("/api/maquinas/delete", id, "Maquina excluida.")
          }
          onOperationDelete={(id) =>
            deleteCollectionItem("/api/operacoes/delete", id, "Operacao excluida.")
          }
          onMaterialDelete={(id) =>
            deleteCollectionItem("/api/materiais/delete", id, "Material excluido.")
          }
        />
      ) : null}

      {activeModule === "messages" ? (
        <MessagesModule
          messages={filteredMessages}
          messagePendingCount={messagePendingCount}
          messageSearch={messageSearch}
          setMessageSearch={setMessageSearch}
          messageStatusFilter={messageStatusFilter}
          setMessageStatusFilter={setMessageStatusFilter}
          messageReplyDrafts={messageReplyDrafts}
          onReplyDraftChange={handleMessageReplyDraftChange}
          onReplyStart={handleMessageReplyStart}
          onReplyConfirm={handleMessageReplyConfirm}
          activeReplyId={activeReplyId}
          sendingReplyId={sendingReplyId}
          onRefresh={() => refreshMessages()}
          messagesLoading={messagesLoading}
          contactList={contactList}
          messageStats={messageStats}
          messageSimForm={messageSimForm}
          setMessageSimForm={setMessageSimForm}
          onSimulateMessage={handleSimulateMessage}
          simulatingMessage={simulatingMessage}
          onBack={() => setActiveModule(null)}
        />
      ) : null}

      {activeModule === "notes" ? (
        <NotesModule
          annotationForm={annotationForm}
          setAnnotationForm={setAnnotationForm}
          annotationSearch={annotationSearch}
          setAnnotationSearch={setAnnotationSearch}
          filteredAnnotations={filteredAnnotations}
          expandedAnnotationId={expandedAnnotationId}
          setExpandedAnnotationId={setExpandedAnnotationId}
          onSubmit={handleAnnotationSubmit}
        />
      ) : null}

      {activeModule === "print" && printDraft ? (
        <PrintModule
          draft={printDraft}
          onBack={() => setActiveModule("production")}
          onPrint={() => window.print()}
        />
      ) : null}

        </section>
      </div>

      <datalist id="machine-options">
        {workspace.maquinas.map((machine) => (
          <option key={machine._id} value={machine.apelido} />
        ))}
      </datalist>

      <datalist id="operation-options">
        {workspace.operacoes.map((operation) => (
          <option key={operation._id} value={operation.nomeOperacao} />
        ))}
      </datalist>

      <datalist id="material-options">
        {workspace.materiais.map((material) => (
          <option key={material._id} value={material.codigo} />
        ))}
      </datalist>

      <datalist id="sku-options">
        {skuOptions.map((option) => (
          <option key={option.sku} value={option.sku} />
        ))}
      </datalist>
    </main>
  );
}
