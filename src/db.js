const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data.sqlite');

let dbInstance = null;

async function initDb() {
    if (dbInstance) return dbInstance;

    const db = await open({
        filename: DB_PATH,
        driver: sqlite3.Database
    });

    await db.exec(`PRAGMA foreign_keys = ON;`);

    // 1. Definição das Tabelas
    await db.exec(`
        CREATE TABLE IF NOT EXISTS tablets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tombamento TEXT UNIQUE,
            serial TEXT,
            modelo TEXT,
            status TEXT DEFAULT 'Disponível',
            municipio TEXT,
            observacoes TEXT,
            ticket TEXT,
            is_reserve INTEGER DEFAULT 0,
            reserve_pin TEXT,
            created_at TEXT,
            updated_at TEXT,
            maintenance_entry_date TEXT,
            maintenance_exit_date TEXT
        )
    `);

    await db.exec(`
        CREATE TABLE IF NOT EXISTS professionals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            cpf TEXT,
            municipio TEXT
        )
    `);

    await db.exec(`
        CREATE TABLE IF NOT EXISTS assignments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tablet_id INTEGER,
            professional_id INTEGER,
            start_date TEXT,
            end_date TEXT,
            attendant_name TEXT,
            FOREIGN KEY(tablet_id) REFERENCES tablets(id),
            FOREIGN KEY(professional_id) REFERENCES professionals(id)
        )
    `);

    await db.exec(`
        CREATE TABLE IF NOT EXISTS maintenances (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tablet_id INTEGER,
            entry_date TEXT,
            exit_date TEXT,
            reason TEXT,
            notes TEXT,
            ticket TEXT,
            FOREIGN KEY(tablet_id) REFERENCES tablets(id)
        )
    `);

    // --- MIGRAÇÕES E CORREÇÕES AUTOMÁTICAS ---
    const cols = await db.all("PRAGMA table_info(tablets)");
    
    // Cria colunas se não existirem
    if (!cols.find(c => c.name === 'municipio')) await db.exec("ALTER TABLE tablets ADD COLUMN municipio TEXT");
    if (!cols.find(c => c.name === 'updated_at')) await db.exec("ALTER TABLE tablets ADD COLUMN updated_at TEXT");
    if (!cols.find(c => c.name === 'ticket')) await db.exec("ALTER TABLE tablets ADD COLUMN ticket TEXT");

    // --- AQUI ESTÁ A CORREÇÃO DO SEU PROBLEMA ---
    // Sincroniza tickets: Se o tablet está em manutenção e a coluna 'ticket' nova está vazia,
    // ele busca o ticket lá da tabela de manutenção e preenche de volta.
    console.log(">> DB: Verificando integridade dos tickets...");
    await db.exec(`
        UPDATE tablets
        SET ticket = (
            SELECT ticket FROM maintenances
            WHERE maintenances.tablet_id = tablets.id
            AND maintenances.exit_date IS NULL
            ORDER BY id DESC LIMIT 1
        )
        WHERE status = 'Em manutenção' 
        AND (ticket IS NULL OR ticket = '')
    `);

    dbInstance = db;
    return db;
}

const run = async (sql, params) => { const db = await initDb(); return db.run(sql, params); };
const get = async (sql, params) => { const db = await initDb(); return db.get(sql, params); };
const all = async (sql, params) => { const db = await initDb(); return db.all(sql, params); };

module.exports = { initDb, run, get, all };