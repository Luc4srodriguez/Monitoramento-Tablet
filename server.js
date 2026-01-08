const path = require("path");
const express = require("express");
const { initDb, run, all, get } = require("./src/db"); 

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, "public")));

// Utils
function todayISO() { return new Date().toISOString().slice(0, 10); }
function diffDays(fromISO, toISO) {
  if (!fromISO) return null;
  const f = new Date(fromISO + "T00:00:00");
  const t = new Date((toISO || todayISO()) + "T00:00:00");
  return Math.max(0, Math.floor((t - f) / (1000 * 60 * 60 * 24)));
}

// --- ROTAS ---

// 1. CRIAR TABLET
app.post("/api/tablets", async (req, res) => { 
  try { 
    const { tombamento, serial_number, model, created_at, status, is_reserve, reserve_pin } = req.body || {};
    
    if (!tombamento || !serial_number) return res.status(400).json({ error: "Tombamento e Serial são obrigatórios." });

    const exists = await get(`SELECT id FROM tablets WHERE tombamento = ? OR serial_number = ?`, [tombamento, serial_number]);
    if (exists) return res.status(409).json({ error: "ERRO: Já existe um tablet com este Tombamento ou Serial!" });

    // Salva o tablet. Se for reserva, salva o PIN e marca is_reserve=1
    await run(`INSERT INTO tablets (tombamento, serial_number, model, created_at, status, is_reserve, reserve_pin) VALUES (?, ?, ?, ?, ?, ?, ?)`, 
      [tombamento, serial_number, model, created_at||todayISO(), status||"Disponível", (status==="Reserva"||is_reserve)?1:0, reserve_pin || null]);
    
    res.json({ok:true}); 
  } catch (e) { 
    res.status(500).json({ error: String(e) }); 
  } 
});

// 2. VINCULAR (ASSIGNMENT)
app.post("/api/assignments", async (req, res) => { 
  try { 
    const { tablet_id, professional_id, start_date, attendant_name } = req.body;

    const activeLink = await get(`SELECT id FROM assignments WHERE tablet_id = ? AND end_date IS NULL`, [tablet_id]);
    if (activeLink) return res.status(409).json({ error: "ERRO: Tablet já vinculado! Devolva antes de vincular novamente." });

    await run(`INSERT INTO assignments (tablet_id, professional_id, start_date, attendant_name) VALUES (?, ?, ?, ?)`, 
      [tablet_id, professional_id, start_date||todayISO(), attendant_name || "Sistema"]); 
    
    await run(`UPDATE tablets SET status = ? WHERE id = ?`, ["Em uso", tablet_id]); 
    res.json({ ok: true }); 
  } catch (e) { 
    res.status(500).json({ error: String(e) }); 
  } 
});

// 3. LISTAGEM GERAL
app.get("/api/tablets", async (req, res) => { 
  try { 
    const rows = await all(`
      SELECT 
        t.*, 
        m.ticket AS active_ticket, 
        p.name AS professional_name, 
        p.cpf AS professional_cpf, 
        p.municipality AS professional_municipality,
        a.attendant_name AS current_attendant
      FROM tablets t 
      LEFT JOIN maintenances m ON m.tablet_id = t.id AND m.exit_date IS NULL 
      LEFT JOIN assignments a ON a.id = (SELECT id FROM assignments WHERE tablet_id = t.id ORDER BY id DESC LIMIT 1) 
      LEFT JOIN professionals p ON p.id = a.professional_id 
      ORDER BY t.id DESC
    `); 
    
    const enriched = rows.map(r => ({ ...r, professional_name: (r.status === 'Disponível' && !r.is_reserve) ? null : r.professional_name, maintenance_days: (r.status === "Em manutenção" && r.maintenance_entry_date) ? diffDays(r.maintenance_entry_date, todayISO()) : null })); 
    res.json(enriched); 
  } catch (e) { 
    res.status(500).json({ error: String(e) }); 
  } 
});

// 4. HISTÓRICO (MODIFICADO PARA INCLUIR ATENDENTE E PIN)
app.get("/api/tablets/:id/history", async (req, res) => { 
  try { 
    const id = req.params.id;
    
    // Busca Vínculos (Incluindo Nome do Atendente e PIN do Tablet)
    const assigns = await all(`
        SELECT 
            'assign' as type, 
            a.start_date as date, 
            a.end_date, 
            p.name as info, 
            a.attendant_name,
            t.reserve_pin
        FROM assignments a 
        JOIN professionals p ON p.id = a.professional_id 
        JOIN tablets t ON t.id = a.tablet_id
        WHERE a.tablet_id = ?
    `, [id]);
    
    // Busca Manutenções
    const maints = await all(`SELECT 'maint' as type, entry_date as date, exit_date as end_date, reason as info, ticket FROM maintenances WHERE tablet_id = ?`, [id]);
    
    // Busca Criação
    const creation = await get(`SELECT 'create' as type, created_at as date, 'Tablet Cadastrado' as info FROM tablets WHERE id = ?`, [id]);
    
    let timeline = [...assigns, ...maints]; 
    if(creation) timeline.push(creation); 
    
    timeline.sort((a, b) => new Date(b.date) - new Date(a.date)); 
    res.json(timeline); 
  } catch (e) { 
    res.status(500).json({ error: String(e) }); 
  } 
});

// --- DEMAIS ROTAS ---
app.post("/api/professionals", async (req, res) => { try { const { name, cpf, municipality } = req.body; const cleanCpf = cpf.replace(/\D/g, ""); if (cleanCpf.length > 0) { const exists = await get(`SELECT id FROM professionals WHERE replace(replace(replace(cpf, '.', ''), '-', ''), ' ', '') = ?`, [cleanCpf]); if (exists) return res.status(409).json({ error: "ERRO: CPF já cadastrado!" }); } await run(`INSERT INTO professionals (name, cpf, municipality) VALUES (?, ?, ?)`, [name, cpf, municipality]); res.json({ ok: true }); } catch (e) { res.status(500).json({ error: String(e) }); } });
app.put("/api/tablets/:id", async (req, res) => { try { await run(`UPDATE tablets SET serial_number = ?, model = ? WHERE id = ?`, [req.body.serial_number, req.body.model, req.params.id]); res.json({ ok: true }); } catch (e) { res.status(500).json({ error: String(e) }); } });
app.delete("/api/tablets/:id", async (req, res) => { try { await run(`DELETE FROM assignments WHERE tablet_id = ?`, [req.params.id]); await run(`DELETE FROM maintenances WHERE tablet_id = ?`, [req.params.id]); await run(`DELETE FROM tablets WHERE id = ?`, [req.params.id]); res.json({ ok: true }); } catch (e) { res.status(500).json({ error: String(e) }); } });
app.get("/api/professionals", async (req, res) => { try { const r = await all(`SELECT * FROM professionals ORDER BY id DESC`); res.json(r); } catch (e) { res.status(500).json({ error: String(e) }); } });
app.delete("/api/professionals/:id", async (req, res) => { try { await run(`DELETE FROM professionals WHERE id = ?`, [req.params.id]); res.json({ ok: true }); } catch (e) { res.status(500).json({ error: String(e) }); } });
app.post("/api/assignments/close", async (req, res) => { try { await run(`UPDATE assignments SET end_date = ? WHERE tablet_id = ? AND end_date IS NULL`, [req.body.end_date||todayISO(), req.body.tablet_id]); await run(`UPDATE tablets SET status = ? WHERE id = ?`, ["Disponível", req.body.tablet_id]); res.json({ ok: true }); } catch (e) { res.status(500).json({ error: String(e) }); } });
app.get("/api/maintenances", async (req, res) => { try { const r = await all(`SELECT m.*, t.tombamento FROM maintenances m JOIN tablets t ON t.id = m.tablet_id ORDER BY m.id DESC`); res.json(r); } catch (e) { res.status(500).json({ error: String(e) }); } });
app.post("/api/maintenances/ticket", async (req, res) => { try { await run(`UPDATE maintenances SET ticket = ? WHERE id = ?`, [req.body.ticket, req.body.maintenance_id]); res.json({ ok: true }); } catch (e) { res.status(500).json({ error: String(e) }); } });
app.post("/api/maintenances/entry", async (req, res) => { try { const last = await get(`SELECT p.name, p.cpf FROM assignments a JOIN professionals p ON p.id = a.professional_id WHERE a.tablet_id = ? AND a.end_date IS NULL`, [req.body.tablet_id]); await run(`UPDATE assignments SET end_date = ? WHERE tablet_id = ? AND end_date IS NULL`, [req.body.entry_date||todayISO(), req.body.tablet_id]); const r = await run(`INSERT INTO maintenances (tablet_id, entry_date, reason, notes) VALUES (?, ?, ?, ?)`, [req.body.tablet_id, req.body.entry_date||todayISO(), req.body.reason, req.body.notes]); await run(`UPDATE tablets SET status = ?, maintenance_entry_date = ? WHERE id = ?`, ["Em manutenção", req.body.entry_date||todayISO(), req.body.tablet_id]); const t = await get("SELECT * FROM tablets WHERE id=?", [req.body.tablet_id]); res.json({ ok: true, maintenance_id: r.lastID, tablet: t, last_professional: last, data: req.body }); } catch (e) { res.status(500).json({ error: String(e) }); } });
app.post("/api/maintenances/exit", async (req, res) => { try { const { tablet_id, exit_date } = req.body; const date = exit_date || todayISO(); const m = await get(`SELECT * FROM maintenances WHERE tablet_id = ? AND exit_date IS NULL LIMIT 1`, [tablet_id]); if(!m) return res.status(400).json({error:"Manutenção não encontrada"}); await run(`UPDATE maintenances SET exit_date = ? WHERE id = ?`, [date, m.id]); const lastAssign = await get(`SELECT professional_id FROM assignments WHERE tablet_id = ? ORDER BY id DESC LIMIT 1`, [tablet_id]); if (lastAssign) { await run(`INSERT INTO assignments (tablet_id, professional_id, start_date) VALUES (?, ?, ?)`, [tablet_id, lastAssign.professional_id, date]); await run(`UPDATE tablets SET status = 'Em uso', maintenance_exit_date = NULL WHERE id = ?`, [tablet_id]); } else { await run(`UPDATE tablets SET status = 'Disponível', maintenance_exit_date = NULL WHERE id = ?`, [tablet_id]); } res.json({ ok: true, restored_owner: !!lastAssign }); } catch (e) { res.status(500).json({ error: String(e) }); } });
app.post("/api/import", async (req, res) => { try { const { data, import_mode } = req.body; if (!Array.isArray(data) || data.length === 0) return res.status(400).json({ error: "Vazio" }); let stats = { tablets_new: 0, profs_new: 0, links: 0, errors: 0 }; for (const row of data) { try { let tomb = String(row.tombamento || "").trim(); const serial = String(row.serial || "").trim(); if (!tomb && serial) tomb = serial; if (!tomb) continue; const model = String(row.modelo || "Genérico").trim(); const nome = String(row.nome || "").replace(/["']/g, "").trim(); const cpf = String(row.cpf || "").replace(/\D/g, ""); const city = (String(row.municipio || "").trim() + (row.unidade ? ` - ${row.unidade}` : "")).trim(); let date = todayISO(); if (row.data_recebimento) { const rd = String(row.data_recebimento).trim(); if(rd.includes("/")) { const p = rd.split("/"); if(p.length === 3) date = `${p[2]}-${p[1]}-${p[0]}`; } else if(rd.match(/^\d{4}-\d{2}-\d{2}$/)) { date = rd; } } let st = "Disponível"; let isReserve = (import_mode === "Reserva") ? 1 : 0; if (import_mode === "Em uso") st = "Em uso"; if (import_mode === "Em manutenção") st = "Em manutenção"; let t = await get(`SELECT * FROM tablets WHERE tombamento = ?`, [tomb]); if (!t && serial) t = await get(`SELECT * FROM tablets WHERE serial_number = ?`, [serial]); if (!t) { await run(`INSERT INTO tablets (tombamento, serial_number, model, created_at, status, is_reserve) VALUES (?, ?, ?, ?, ?, ?)`, [tomb, serial || "S/N", model, date, st, isReserve]); t = await get(`SELECT * FROM tablets WHERE tombamento = ?`, [tomb]); stats.tablets_new++; } else { if(import_mode === "Reserva") await run(`UPDATE tablets SET is_reserve = 1 WHERE id = ?`, [t.id]); else await run(`UPDATE tablets SET status = ? WHERE id = ?`, [st, t.id]); } let p = null; if (cpf.length >= 5 || nome.length > 2) { if(cpf.length >= 5) p = await get(`SELECT * FROM professionals WHERE cpf = ?`, [cpf]); if(!p && nome) p = await get(`SELECT * FROM professionals WHERE name = ?`, [nome]); if (!p) { await run(`INSERT INTO professionals (name, cpf, municipality) VALUES (?, ?, ?)`, [nome, cpf, city]); p = await get(`SELECT * FROM professionals WHERE name = ?`, [nome]); stats.profs_new++; } } if ((st === "Em uso" || (import_mode === "Reserva" && p)) && p) { const l = await get(`SELECT * FROM assignments WHERE tablet_id = ? AND end_date IS NULL`, [t.id]); if (!l) { await run(`INSERT INTO assignments (tablet_id, professional_id, start_date) VALUES (?, ?, ?)`, [t.id, p.id, date]); await run(`UPDATE tablets SET status = 'Em uso' WHERE id = ?`, [t.id]); stats.links++; } } if (st === "Em manutenção") { if (p) { const h = await get(`SELECT * FROM assignments WHERE tablet_id = ? AND professional_id = ? LIMIT 1`, [t.id, p.id]); if (!h) await run(`INSERT INTO assignments (tablet_id, professional_id, start_date, end_date) VALUES (?, ?, ?, ?)`, [t.id, p.id, date, date]); } const m = await get(`SELECT * FROM maintenances WHERE tablet_id = ? AND exit_date IS NULL`, [t.id]); if (!m) { await run(`INSERT INTO maintenances (tablet_id, entry_date, reason, notes) VALUES (?, ?, ?, ?)`, [t.id, date, "Importado do Excel", `Dono: ${nome}`]); await run(`UPDATE tablets SET maintenance_entry_date = ? WHERE id = ?`, [date, t.id]); stats.links++; } } } catch (err) { console.error(err); stats.errors++; } } res.json({ ok: true, stats }); } catch (e) { res.status(500).json({ error: String(e) }); } });

initDb().then(() => { app.listen(PORT, () => console.log(`Rodando na porta ${PORT}`)); }).catch(console.error);