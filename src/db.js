const path = require("path");
const sqlite3 = require("sqlite3").verbose();

const DB_PATH = process.env.DB_PATH || path.join(__dirname, "..", "data.sqlite");
const db = new sqlite3.Database(DB_PATH);

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve({ changes: this.changes, lastID: this.lastID });
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

async function initDb() {
  await run(`PRAGMA foreign_keys = ON`);

  // Tabela Tablets
  await run(`
    CREATE TABLE IF NOT EXISTS tablets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tombamento TEXT NOT NULL UNIQUE,
      serial_number TEXT NOT NULL,
      model TEXT NOT NULL,
      created_at TEXT NOT NULL,
      status TEXT NOT NULL,
      is_reserve INTEGER DEFAULT 0,
      reserve_pin TEXT,  -- NOVA COLUNA: Senha do Tablet Reserva
      maintenance_entry_date TEXT,
      maintenance_exit_date TEXT
    )
  `);

  // MIGRAÇÃO: Adiciona colunas se não existirem (Para bancos já criados)
  try { await run(`ALTER TABLE tablets ADD COLUMN is_reserve INTEGER DEFAULT 0`); } catch (e) {}
  try { await run(`ALTER TABLE tablets ADD COLUMN reserve_pin TEXT`); } catch (e) {}

  // Tabela Profissionais
  await run(`
    CREATE TABLE IF NOT EXISTS professionals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      cpf TEXT NOT NULL,
      municipality TEXT NOT NULL
    )
  `);

  // Tabela Vínculos (Assignments)
  await run(`
    CREATE TABLE IF NOT EXISTS assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tablet_id INTEGER NOT NULL,
      professional_id INTEGER NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT,
      attendant_name TEXT, -- NOVA COLUNA: Quem entregou
      FOREIGN KEY (tablet_id) REFERENCES tablets(id) ON DELETE CASCADE,
      FOREIGN KEY (professional_id) REFERENCES professionals(id) ON DELETE RESTRICT
    )
  `);

  // MIGRAÇÃO assignments
  try { await run(`ALTER TABLE assignments ADD COLUMN attendant_name TEXT`); } catch (e) {}

  // Tabela Manutenções
  await run(`
    CREATE TABLE IF NOT EXISTS maintenances (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tablet_id INTEGER NOT NULL,
      entry_date TEXT NOT NULL,
      exit_date TEXT,
      reason TEXT,
      notes TEXT,
      ticket TEXT, 
      FOREIGN KEY (tablet_id) REFERENCES tablets(id) ON DELETE CASCADE
    )
  `);
}

module.exports = { run, get, all, initDb };