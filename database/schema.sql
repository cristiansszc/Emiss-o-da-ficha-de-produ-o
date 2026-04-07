PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS contatos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  telefone TEXT NOT NULL,
  email TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_contatos_telefone ON contatos(telefone);
CREATE INDEX IF NOT EXISTS idx_contatos_email ON contatos(email);

CREATE TABLE IF NOT EXISTS mensagens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contato_id INTEGER NOT NULL,
  mensagem TEXT NOT NULL,
  resposta TEXT,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'respondido')),
  data_criacao TEXT NOT NULL,
  FOREIGN KEY (contato_id) REFERENCES contatos(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_mensagens_status ON mensagens(status);
CREATE INDEX IF NOT EXISTS idx_mensagens_data_criacao ON mensagens(data_criacao DESC);
