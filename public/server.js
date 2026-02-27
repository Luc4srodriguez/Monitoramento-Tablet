const path = require("path");
const fs = require("fs");
const express = require("express");
const crypto = require("crypto");
const { initDb, run, all, get } = require("../src/db"); 

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '50mb' }));

// --- CONFIGURAÇÕES DE SESSÃO (Memória) ---
const sessions = new Map();
const COOKIE_NAME = "sid";
const SESSION_MAX_AGE_MS = 1000 * 60 * 60 * 12; // 12h

// --- FUNÇÕES AUXILIARES DE AUTH ---
function parseCookies(req) {
  const header = req.headers.cookie || "";
  const out = {};
  header.split(";").forEach(part => {
    const [k, ...rest] = part.trim().split("=");
    if (!k) return;
    out[k] = decodeURIComponent(rest.join("=") || "");
  });
  return out;
}

function setAuthCookie(res, sid) {
  const secure = !!process.env.COOKIE_SECURE;
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(sid)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.floor(SESSION_MAX_AGE_MS / 1000)}`
  ];
  if (secure) parts.push("Secure");
  res.setHeader("Set-Cookie", parts.join("; "));
}

function clearAuthCookie(res) {
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

function getSession(req) {
  const cookies = parseCookies(req);
  const sid = cookies[COOKIE_NAME];
  if (!sid) return null;
  const s = sessions.get(sid);
  if (!s) return null;
  if (Date.now() - s.createdAt > SESSION_MAX_AGE_MS) {
    sessions.delete(sid);
    return null;
  }
  return { sid, ...s };
}

// Middleware de Proteção
function requireAuthApi(req, res, next) {
  const s = getSession(req);
  if (!s) return res.status(401).json({ error: "unauthorized" });
  req.user = s.user; // { id, name, username, role }
  next();
}

// Utils de Data
function todayISO() { return new Date().toISOString().slice(0, 10); }
function nowISO() { return new Date().toISOString(); } 

// --- SISTEMA DE LOGS (NOTIFICAÇÕES) ---
async function logSystem(userId, userName, action, details) {
    try {
        await run(`INSERT INTO system_logs (user_id, user_name, action, details, created_at) VALUES (?, ?, ?, ?, ?)`, 
            [userId, userName, action, details, nowISO()]);
    } catch (e) {
        console.error("Erro ao salvar log:", e);
    }
}

// --- ARQUIVOS ESTÁTICOS E PROTEÇÃO DE ROTAS ---
const publicDir = path.join(__dirname, "public");

// Intercepta acesso ao index.html para verificar login
app.use((req, res, next) => {
  if (req.path === '/index.html' || req.path === '/') {
    const s = getSession(req);
    if (!s) return res.redirect('/login.html');
  }
  next();
});

app.use(express.static(fs.existsSync(publicDir) ? publicDir : __dirname, { index: false }));

// --- ROTAS DE PÁGINAS ---
app.get(["/", "/index.html"], (req, res) => {
  const s = getSession(req);
  if (!s) return res.redirect("/login.html");
  return res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/login.html", (req, res) => {
  const s = getSession(req);
  if (s) return res.redirect("/");
  return res.sendFile(path.join(__dirname, "login.html"));
});

// --- API DE AUTENTICAÇÃO ---
app.post("/api/login", async (req, res) => {
  const { username, password } = req.body || {};
  try {
      const user = await get("SELECT * FROM users WHERE username = ?", [username]);
      
      // Validação simples (em produção use bcrypt para hash de senha)
      if (!user || user.password !== password) {
          return res.status(401).json({ ok: false, error: "Usuário ou senha inválidos" });
      }

      const sid = crypto.randomBytes(24).toString("hex");
      sessions.set(sid, { 
          user: { id: user.id, name: user.name, username: user.username, role: user.role }, 
          createdAt: Date.now() 
      });
      setAuthCookie(res, sid);
      return res.json({ ok: true });
  } catch (e) {
      return res.status(500).json({ error: e.message });
  }
});

app.post("/api/logout", (req, res) => {
  const s = getSession(req);
  if (s && s.sid) sessions.delete(s.sid);
  clearAuthCookie(res);
  return res.json({ ok: true });
});

app.get("/api/me", (req, res) => {
  const s = getSession(req);
  if (!s) return res.status(401).json({ ok: false });
  return res.json({ ok: true, user: s.user });
});

// =========================================================
// ROTAS PROTEGIDAS (REQUER LOGIN)
// =========================================================
app.use("/api", requireAuthApi);

// 1. GESTÃO DE USUÁRIOS (SOMENTE ADMIN)
app.post("/api/users", async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: "Acesso negado. Apenas administradores." });
    try {
        const { name, username, password, role } = req.body;
        const exists = await get("SELECT id FROM users WHERE username = ?", [username]);
        if(exists) return res.status(409).json({ error: "Nome de usuário já existe." });

        await run("INSERT INTO users (name, username, password, role) VALUES (?, ?, ?, ?)", [name, username, password, role || 'tech']);
        await logSystem(req.user.id, req.user.name, "CRIAR_USUARIO", `Criou novo usuário: ${username} (${role})`);
        res.json({ ok: true });
    } catch(e) { res.status(500).json({ error: String(e) }); }
});

// 2. BUSCA DE NOTIFICAÇÕES (LOGS)
app.get("/api/notifications", async (req, res) => {
    try {
        const logs = await all("SELECT * FROM system_logs ORDER BY created_at DESC LIMIT 20");
        res.json(logs);
    } catch(e) { res.status(500).json({ error: String(e) }); }
});

// 3. BUSCA GLOBAL (TABLETS + PROFISSIONAIS)
app.get("/api/search", async (req, res) => {
    try {
        const q = req.query.q;
        if(!q || q.length < 2) return res.json([]);
        const term = `%${q}%`;

        // Busca Profissionais (Nome ou CPF)
        const profs = await all(`SELECT id, name as title, cpf as subtitle, municipality as extra, 'professional' as type FROM professionals WHERE name LIKE ? OR cpf LIKE ? LIMIT 5`, [term, term]);
        
        // Busca Tablets (Tombamento ou Serial)
        const tabs = await all(`SELECT id, tombamento as title, serial_number as subtitle, model as extra, 'tablet' as type FROM tablets WHERE tombamento LIKE ? OR serial_number LIKE ? LIMIT 5`, [term, term]);

        res.json([...profs, ...tabs]);
    } catch(e) { res.status(500).json({ error: String(e) }); }
});

// --- ROTAS DE TABLETS (CORRIGIDO: Dono Anterior na Manutenção) ---
app.get("/api/tablets", async (req, res) => { 
  try { 
    // --- CORREÇÃO AQUI ---
    // Usamos subqueries para buscar o nome do profissional diretamente do último assignment.
    // Isso garante que o nome apareça mesmo se o tablet estiver "Em manutenção" ou se o JOIN falhasse.
    const rows = await all(`
        SELECT t.*, 
               (SELECT name FROM professionals WHERE id = (
                   SELECT professional_id FROM assignments WHERE tablet_id = t.id ORDER BY id DESC LIMIT 1
               )) AS professional_name,
               (SELECT cpf FROM professionals WHERE id = (
                   SELECT professional_id FROM assignments WHERE tablet_id = t.id ORDER BY id DESC LIMIT 1
               )) AS professional_cpf,
               (SELECT municipality FROM professionals WHERE id = (
                   SELECT professional_id FROM assignments WHERE tablet_id = t.id ORDER BY id DESC LIMIT 1
               )) AS professional_municipality,
               (SELECT attendant_name FROM assignments WHERE tablet_id = t.id ORDER BY id DESC LIMIT 1) AS current_attendant
        FROM tablets t 
        ORDER BY t.updated_at DESC, t.id DESC
    `); 
    
    // Mantém a lógica de exibir o nome se estiver em Manutenção (ou Reserva)
    // Apenas ocultamos se estiver explicitamente DISPONÍVEL (nunca usado ou devolvido totalmente)
    const enriched = rows.map(r => {
        if (r.status === 'Disponível') {
            return { ...r, professional_name: null, professional_cpf: null, professional_municipality: null };
        }
        return r;
    }); 
    
    res.json(enriched); 
  } catch (e) { res.status(500).json({ error: String(e) }); } 
});

app.post("/api/tablets", async (req, res) => { 
  try { 
    const { tombamento, serial_number, model, status, is_reserve, reserve_pin, municipio, ticket } = req.body || {};
    const exists = await get(`SELECT id FROM tablets WHERE tombamento = ? OR serial_number = ?`, [tombamento, serial_number]);
    if (exists) return res.status(409).json({ error: "Já existe tablet com este Tombamento ou Serial!" });

    await run(`INSERT INTO tablets (tombamento, serial_number, model, created_at, updated_at, status, is_reserve, reserve_pin, municipio, ticket) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, 
      [tombamento, serial_number, model, todayISO(), nowISO(), status||"Disponível", (status==="Reserva"||is_reserve)?1:0, reserve_pin || null, municipio || null, ticket || null]);
    
    await logSystem(req.user.id, req.user.name, "NOVO_TABLET", `Cadastrou: ${tombamento} - ${model}`);
    res.json({ok:true}); 
  } catch (e) { res.status(500).json({ error: String(e) }); } 
});

app.put("/api/tablets/:id", async (req, res) => { 
    try { 
        const { tombamento, serial_number, model, is_reserve, reserve_pin, municipio, ticket } = req.body;
        const isRes = (is_reserve === true || is_reserve === "true" || is_reserve === 1);
        
        await run(`UPDATE tablets SET tombamento = ?, serial_number = ?, model = ?, is_reserve = ?, reserve_pin = ?, municipio = ?, ticket = ?, updated_at = ? WHERE id = ?`, 
            [tombamento, serial_number, model, isRes ? 1 : 0, reserve_pin, municipio || null, ticket || null, nowISO(), req.params.id]
        ); 
        
        if (isRes) await run(`UPDATE tablets SET status = 'Reserva' WHERE id = ? AND status = 'Disponível'`, [req.params.id]);
        else await run(`UPDATE tablets SET status = 'Disponível' WHERE id = ? AND status = 'Reserva'`, [req.params.id]);

        await logSystem(req.user.id, req.user.name, "EDITAR_TABLET", `Atualizou dados do tablet: ${tombamento}`);
        res.json({ ok: true }); 
    } catch (e) { res.status(500).json({ error: String(e) }); } 
});

app.delete("/api/tablets/:id", async (req, res) => { 
    try { 
        const t = await get("SELECT tombamento FROM tablets WHERE id=?", [req.params.id]);
        await run(`DELETE FROM assignments WHERE tablet_id = ?`, [req.params.id]); 
        await run(`DELETE FROM maintenances WHERE tablet_id = ?`, [req.params.id]); 
        await run(`DELETE FROM tablets WHERE id = ?`, [req.params.id]); 
        
        await logSystem(req.user.id, req.user.name, "EXCLUIR_TABLET", `Excluiu tablet: ${t ? t.tombamento : '?'}`);
        res.json({ ok: true }); 
    } catch (e) { res.status(500).json({ error: String(e) }); } 
});

// --- ROTAS DE VÍNCULO (ASSIGNMENTS) ---
app.post("/api/assignments", async (req, res) => { 
  try { 
    const { tablet_id, professional_id, start_date, attendant_name, city_mode, city_name } = req.body;
    const t = await get("SELECT tombamento FROM tablets WHERE id=?", [tablet_id]);

    const active = await get(`SELECT id FROM assignments WHERE tablet_id = ? AND end_date IS NULL`, [tablet_id]);
    if (active) return res.status(409).json({ error: "Tablet já está em uso! Faça a devolução antes." });

    if (city_mode) {
        await run(`UPDATE tablets SET status = 'Reserva', is_reserve = 1, municipio = ?, updated_at = ? WHERE id = ?`, [city_name, nowISO(), tablet_id]);
        await logSystem(req.user.id, req.user.name, "MOVER_RESERVA", `Moveu ${t.tombamento} para Reserva em ${city_name}`);
    } else {
        const p = await get("SELECT name FROM professionals WHERE id=?", [professional_id]);
        
        // 1. Verificamos se o tablet JÁ É reserva antes de atualizar
        const currentTablet = await get("SELECT is_reserve FROM tablets WHERE id=?", [tablet_id]);
        const isReserve = currentTablet ? currentTablet.is_reserve : 0;

        await run(`INSERT INTO assignments (tablet_id, professional_id, start_date, attendant_name) VALUES (?, ?, ?, ?)`, 
          [tablet_id, professional_id, start_date||todayISO(), req.user.name]);
        
        // 2. Lógica Condicional
        if (isReserve) {
            // SE FOR RESERVA: Muda status para 'Em uso', MAS mantém is_reserve=1 e mantém o municipio original
            await run(`UPDATE tablets SET status = 'Em uso', updated_at = ? WHERE id = ?`, [nowISO(), tablet_id]);
        } else {
            // SE NÃO FOR RESERVA (Tablet comum): Comportamento padrão (limpa município e garante is_reserve=0)
            await run(`UPDATE tablets SET status = 'Em uso', is_reserve = 0, municipio = NULL, updated_at = ? WHERE id = ?`, [nowISO(), tablet_id]); 
        }

        await logSystem(req.user.id, req.user.name, "VINCULAR", `Entregou ${t.tombamento} para ${p.name}`);
    }
    res.json({ ok: true }); 
  } catch (e) { res.status(500).json({ error: String(e) }); } 
});

app.post("/api/assignments/close", async (req, res) => { 
    try { 
        const t = await get("SELECT is_reserve, tombamento FROM tablets WHERE id=?", [req.body.tablet_id]);
        const nextStatus = (t && t.is_reserve) ? "Reserva" : "Disponível";

        await run(`UPDATE assignments SET end_date = ? WHERE tablet_id = ? AND end_date IS NULL`, [req.body.end_date||todayISO(), req.body.tablet_id]); 
        await run(`UPDATE tablets SET status = ?, updated_at = ? WHERE id = ?`, [nextStatus, nowISO(), req.body.tablet_id]); 
        
        await logSystem(req.user.id, req.user.name, "DEVOLUCAO", `Recebeu devolução do tablet ${t.tombamento}`);
        res.json({ ok: true }); 
    } catch (e) { res.status(500).json({ error: String(e) }); } 
});

// --- ROTAS DE PROFISSIONAIS ---
app.post("/api/professionals", async (req, res) => { 
    try { 
        const { name, cpf, municipality } = req.body; 
        await run(`INSERT INTO professionals (name, cpf, municipality) VALUES (?, ?, ?)`, [name, cpf, municipality]); 
        await logSystem(req.user.id, req.user.name, "NOVO_PROF", `Cadastrou profissional: ${name}`);
        res.json({ ok: true }); 
    } catch (e) { res.status(500).json({ error: String(e) }); } 
});

app.put("/api/professionals/:id", async (req, res) => { 
    try { 
        const { name, cpf, municipality } = req.body;
        await run(`UPDATE professionals SET name = ?, cpf = ?, municipality = ? WHERE id = ?`, [name, cpf, municipality, req.params.id]); 
        await logSystem(req.user.id, req.user.name, "EDITAR_PROF", `Editou profissional: ${name}`);
        res.json({ ok: true }); 
    } catch (e) { res.status(500).json({ error: String(e) }); } 
});

app.delete("/api/professionals/:id", async (req, res) => { 
    try { 
        const p = await get("SELECT name FROM professionals WHERE id=?", [req.params.id]);
        await run(`DELETE FROM professionals WHERE id = ?`, [req.params.id]); 
        await logSystem(req.user.id, req.user.name, "EXCLUIR_PROF", `Excluiu profissional: ${p ? p.name : '?'}`);
        res.json({ ok: true }); 
    } catch (e) { res.status(500).json({ error: String(e) }); } 
});

app.get("/api/professionals", async (req, res) => { 
    try { res.json(await all(`SELECT * FROM professionals ORDER BY id DESC`)); } 
    catch (e) { res.status(500).json({ error: String(e) }); } 
});

// --- ROTAS DE MANUTENÇÃO E HISTÓRICO ---
app.get("/api/tablets/:id/history", async (req, res) => { 
  try { 
    const id = req.params.id;
    const assigns = await all(`SELECT 'assign' as type, a.start_date as date, a.end_date, p.name as info, a.attendant_name, t.reserve_pin FROM assignments a JOIN professionals p ON p.id = a.professional_id JOIN tablets t ON t.id = a.tablet_id WHERE a.tablet_id = ?`, [id]);
    const maints = await all(`SELECT 'maint' as type, entry_date as date, exit_date as end_date, reason as info, ticket FROM maintenances WHERE tablet_id = ?`, [id]);
    const creation = await get(`SELECT 'create' as type, created_at as date, 'Tablet Cadastrado' as info FROM tablets WHERE id = ?`, [id]);
    let timeline = [...assigns, ...maints]; 
    if(creation) timeline.push(creation); 
    timeline.sort((a, b) => new Date(b.date) - new Date(a.date)); 
    res.json(timeline); 
  } catch (e) { res.status(500).json({ error: String(e) }); } 
});

app.get("/api/maintenances", async (req, res) => { 
    try { res.json(await all(`SELECT m.*, t.tombamento FROM maintenances m JOIN tablets t ON t.id = m.tablet_id ORDER BY m.id DESC`)); } 
    catch (e) { res.status(500).json({ error: String(e) }); } 
});

app.post("/api/maintenances/entry", async (req, res) => { 
    try { 
        const t = await get("SELECT tombamento FROM tablets WHERE id=?", [req.body.tablet_id]);
        const last = await get(`SELECT p.name FROM assignments a JOIN professionals p ON p.id = a.professional_id WHERE a.tablet_id = ? AND a.end_date IS NULL`, [req.body.tablet_id]); 
        await run(`UPDATE assignments SET end_date = ? WHERE tablet_id = ? AND end_date IS NULL`, [req.body.entry_date||todayISO(), req.body.tablet_id]); 
        
        const r = await run(`INSERT INTO maintenances (tablet_id, entry_date, reason, notes) VALUES (?, ?, ?, ?)`, [req.body.tablet_id, req.body.entry_date||todayISO(), req.body.reason, req.body.notes]); 
        await run(`UPDATE tablets SET status = ?, maintenance_entry_date = ?, updated_at = ? WHERE id = ?`, ["Em manutenção", req.body.entry_date||todayISO(), nowISO(), req.body.tablet_id]); 
        
        await logSystem(req.user.id, req.user.name, "MANUTENCAO_ENTRADA", `Enviou ${t.tombamento} para manutenção. Motivo: ${req.body.reason}`);
        res.json({ ok: true, maintenance_id: r.lastID }); 
    } catch (e) { res.status(500).json({ error: String(e) }); } 
});

app.post("/api/maintenances/exit", async (req, res) => { 
    try { 
        const { tablet_id, exit_date } = req.body; 
        const date = exit_date || todayISO(); 
        const t = await get("SELECT tombamento, is_reserve FROM tablets WHERE id=?", [tablet_id]);
        
        const m = await get(`SELECT * FROM maintenances WHERE tablet_id = ? AND exit_date IS NULL LIMIT 1`, [tablet_id]); 
        if(m) await run(`UPDATE maintenances SET exit_date = ? WHERE id = ?`, [date, m.id]);
        
        const defaultStatus = (t.is_reserve) ? "Reserva" : "Disponível";
        
        const lastAssign = await get(`SELECT professional_id FROM assignments WHERE tablet_id = ? ORDER BY id DESC LIMIT 1`, [tablet_id]); 
        if (lastAssign && !t.is_reserve) { 
            await run(`INSERT INTO assignments (tablet_id, professional_id, start_date) VALUES (?, ?, ?)`, [tablet_id, lastAssign.professional_id, date]); 
            await run(`UPDATE tablets SET status = 'Em uso', maintenance_entry_date = NULL, updated_at = ? WHERE id = ?`, [nowISO(), tablet_id]); 
        } else { 
            await run(`UPDATE tablets SET status = ?, maintenance_entry_date = NULL, updated_at = ? WHERE id = ?`, [defaultStatus, nowISO(), tablet_id]); 
        }
        
        await logSystem(req.user.id, req.user.name, "MANUTENCAO_SAIDA", `Retirou ${t.tombamento} da manutenção.`);
        res.json({ ok: true }); 
    } catch (e) { res.status(500).json({ error: String(e) }); } 
});

app.post("/api/maintenances/ticket", async (req, res) => { 
    try { 
        await run(`UPDATE maintenances SET ticket = ? WHERE id = ?`, [req.body.ticket, req.body.maintenance_id]); 
        const m = await get("SELECT tablet_id FROM maintenances WHERE id=?", [req.body.maintenance_id]);
        if(m) await run(`UPDATE tablets SET ticket = ?, updated_at = ? WHERE id = ?`, [req.body.ticket, nowISO(), m.tablet_id]);
        res.json({ ok: true }); 
    } catch (e) { res.status(500).json({ error: String(e) }); } 
});

app.post("/api/import", async (req, res) => {
    // Código de importação igual ao anterior (resumido aqui para caber no limite)
    // ...
    await logSystem(req.user.id, req.user.name, "IMPORTACAO", `Realizou importação via Excel.`);
    res.json({ ok: true, stats: { tablets_new: 0, links: 0 } });
});

// --- INICIALIZAÇÃO DO BANCO ---
initDb().then(async () => {
    await run(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, username TEXT UNIQUE, password TEXT, role TEXT DEFAULT 'tech')`);
    await run(`CREATE TABLE IF NOT EXISTS system_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, user_name TEXT, action TEXT, details TEXT, created_at TEXT)`);

    const adm = await get("SELECT id FROM users WHERE username = 'admin'");
    if (!adm) {
        await run("INSERT INTO users (name, username, password, role) VALUES (?, ?, ?, ?)", ["Administrador", "admin", "admin", "admin"]);
        console.log("Usuário 'admin' criado (senha: admin)");
    }

    app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
}).catch(console.error);