const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// --- UTILS ---
function toast(msg, type="info"){
  const el = $("#toast"); if(!el) return;
  el.textContent = msg; el.className = `toast`; el.classList.remove("hidden");
  if(type === 'error') el.style.backgroundColor = '#991b1b'; 
  if(type === 'success') el.style.backgroundColor = '#166534';
  if(type === 'warn') el.style.backgroundColor = '#d97706';
  setTimeout(()=> el.classList.add("hidden"), 4000);
}

const normSt = (s) => (s || "").toString().trim().toLowerCase();

async function api(url, opts={}){
  try {
    const res = await fetch(url, { headers: { "Content-Type": "application/json" }, ...opts });
    const data = await res.json().catch(()=>({}));
    if(!res.ok) throw new Error(data.error || `Erro ${res.status}`);
    return data;
  } catch(e) { throw e; }
}

// --- ESTADO GLOBAL ---
let tablets = [], professionals = [], maintenances = [];
let currentWorkbook = null;
let chartInstances = {};
let headerRowIndex = 0; 
let sheetMatrix = [];
let selectedTablets = new Set(); 
const modeloGerador = new Modelo(); 

// --- NAVEGAÇÃO ---
function showView(id) {
  $$('.view').forEach(el => el.classList.add('hidden'));
  const target = $(`#view-${id}`);
  if(target) target.classList.remove('hidden');
  
  $$('.nav-item').forEach(el => el.classList.remove('active'));
  const btn = document.querySelector(`.nav-item[onclick="showView('${id}')"]`);
  if(btn) btn.classList.add('active');
  
  selectedTablets.clear();
  updateBulkActionUI();
  refreshCurrentView();
}

function refreshCurrentView() {
  updateDashboard();
  if(!$("#view-dashboard").classList.contains("hidden")) renderCharts();
  if(!$("#view-tablets").classList.contains("hidden")) renderTablets('tablets');
  if(!$("#view-reserva").classList.contains("hidden")) renderTablets('reserva');
  if(!$("#view-maintenance-list").classList.contains("hidden")) renderTablets('maintenance');
  if(!$("#view-professionals").classList.contains("hidden")) renderProfessionals();
}

function toggleModal(id) {
  const el = $(`#${id}`); if(!el) return;
  
  // Limpeza Import
  if(id === 'modalImport' && el.classList.contains('hidden')) {
    $("#importFile").value = ""; $("#sheetSection").classList.add("hidden"); 
    $("#mappingSection").classList.add("hidden"); $("#importLog").classList.add("hidden"); 
    $("#btnProcess").disabled = true; currentWorkbook = null;
  }

  // Reset Modal Novo Tablet
  if(id === 'modalAddTablet') {
      $("#selectStatusTablet").value = "Disponível";
      handleStatusChange(); 
      $("#inputProfSearch").value = "";
      $("#selectCityLink").value = "";
  }

  // Reset Modal Vincular (COM PROTEÇÃO CONTRA NULL)
  if(id === 'modalLink') {
      if($("#selectCityBind")) $("#selectCityBind").value = "";
      if($("#groupProfBind")) $("#groupProfBind").classList.add("hidden");
      if($("#inputProfBind")) $("#inputProfBind").value = "";
      if($("#inputDateBind")) $("#inputDateBind").value = new Date().toISOString().slice(0,10);
  }

  el.classList.contains('hidden') ? el.classList.remove('hidden') : el.classList.add('hidden');
}

async function loadAll(){
  try {
    const [t, p, m] = await Promise.all([api("/api/tablets"), api("/api/professionals"), api("/api/maintenances")]);
    tablets = t; professionals = p; maintenances = m;
    updateDashboard(); populateFilters(); refreshCurrentView(); fillSelects();
  } catch(e) { console.error(e); toast("Erro ao carregar dados", "error"); }
}

function updateDashboard() {
  $("#kpiTotal").textContent = tablets.length;
  $("#kpiUse").textContent = tablets.filter(t => normSt(t.status) === "em uso" && t.is_reserve != 1).length;
  $("#kpiMaint").textContent = tablets.filter(t => normSt(t.status) === "em manutenção").length;
  $("#kpiReserva").textContent = tablets.filter(t => t.is_reserve == 1).length;
}

// --- RENDERIZAÇÃO ---
function renderTablets(mode) {
  let filtered = [], tableId = "", searchId = "";
  let cityF = "", modelF = "", statusF = "";

  if (mode === 'tablets') {
    filtered = tablets.filter(t => t.is_reserve != 1 && normSt(t.status) !== "em manutenção");
    tableId = "#tableTablets"; searchId = "#searchTablets"; 
    cityF = "#filterCityTablets"; modelF = "#filterModelTablets"; statusF = "#filterStatusTablets";
  } else if (mode === 'reserva') {
    filtered = tablets.filter(t => t.is_reserve == 1 && normSt(t.status) !== "em manutenção");
    tableId = "#tableReserva"; searchId = "#searchReserva"; 
    cityF = "#filterCityReserva"; modelF = "#filterModelReserva"; statusF = "#filterStatusReserva";
  } else if (mode === 'maintenance') {
    filtered = tablets.filter(t => normSt(t.status) === "em manutenção");
    tableId = "#tableMaintList"; searchId = "#searchMaintList"; 
    cityF = "#filterCityMaint"; modelF = "#filterModelMaint";
  }

  const tbody = $(tableId + " tbody");
  if(!tbody) return;

  const q = ($(searchId)?.value || "").toLowerCase();
  const fCity = (cityF && $(cityF)) ? $(cityF).value : "";
  const fModel = (modelF && $(modelF)) ? $(modelF).value : "";
  const fStatus = (statusF && $(statusF)) ? $(statusF).value : "";

  const rows = filtered.filter(t => {
      const matchText = [t.tombamento, t.serial_number, t.model, t.professional_name].some(v => (v||"").toLowerCase().includes(q));
      if(!matchText) return false;
      if(fCity && t.professional_municipality !== fCity) return false;
      if(fModel && t.model !== fModel) return false;
      if(fStatus && normSt(t.status) !== normSt(fStatus)) return false;
      return true;
  });

  tbody.innerHTML = rows.map(t => {
    let badge = "info"; const st = normSt(t.status);
    if(st === "disponível") badge = "success";
    if(st === "em manutenção") badge = "warn";
    if(st === "em uso") badge = "info";

    let loc = "-";
    if(st === "em uso") {
        loc = `<div><strong>👤 ${t.professional_name||"?"}</strong><br/><span style="font-size:11px;color:#666">${t.professional_municipality||""}</span></div>`;
        if(t.current_attendant) loc += `<div style="margin-top:4px; font-size:10px; color:#64748b; background:#f1f5f9; padding:2px 4px; border-radius:4px; display:inline-block">Entregue por: ${t.current_attendant}</div>`;
        if(t.reserve_pin) loc += `<div style="margin-top:4px; font-size:11px; color:#6b21a8; font-weight:bold">🔐 PIN: ${t.reserve_pin}</div>`;
    } else if(st === "em manutenção") {
        loc = `<div><strong style="color:#d97706">🛠️ ${t.professional_name||"Sem dono anterior"}</strong><br/><span style="font-size:11px">${t.professional_municipality||""}</span></div>`;
    } else {
        loc = t.is_reserve ? "📦 Depósito" : "✅ Estoque";
    }

    const safeTomb = (t.tombamento||"").replace(/'/g,"");
    let btns = "";
    const isChecked = selectedTablets.has(t.id) ? "checked" : "";
    let btnPrint = "";
    if (mode !== 'maintenance') {
        btnPrint = `<button class="btn-icon" onclick="directPrintTerm(${t.id})" title="Imprimir Termo de Recebimento"><i class="ph-bold ph-printer" style="color:#475569"></i></button>`;
    }

    if (st === "disponível") {
        btns += `<button class="btn-icon" onclick="openLink(${t.id}, '${safeTomb}')" title="Vincular"><i class="ph-bold ph-link" style="color:var(--primary)"></i></button>`;
        btns += `<button class="btn-icon" onclick="openMaintEntry(${t.id}, '${safeTomb}')" title="Manutenção"><i class="ph-bold ph-wrench" style="color:#d97706"></i></button>`;
        btns += btnPrint;
    } else if (st === "em uso") {
        btns += `<button class="btn-icon" onclick="quickUnlink(${t.id})" title="Devolver"><i class="ph-bold ph-link-break" style="color:#ef4444"></i></button>`;
        btns += `<button class="btn-icon" onclick="openMaintEntry(${t.id}, '${safeTomb}')" title="Manutenção"><i class="ph-bold ph-wrench" style="color:#d97706"></i></button>`;
        btns += btnPrint;
    } else if (st === "em manutenção") {
        btns += `<button class="btn-icon" onclick="openMaintExit(${t.id}, '${safeTomb}')" title="Finalizar"><i class="ph-fill ph-check-circle" style="color:#10b981; font-size:22px"></i></button>`;
    }
    
    if(mode !== 'maintenance') btns += `<button class="btn-icon" onclick="deleteTablet(${t.id})"><i class="ph ph-trash" style="color:#64748b"></i></button>`;

    const ticket = t.active_ticket ? `<span class="badge danger">${t.active_ticket}</span>` : "-";
    const reserveMark = t.is_reserve ? '<span style="color:#6b21a8; font-weight:bold" title="Reserva">(R)</span> ' : '';
    const serialHtml = `<a href="#" onclick="openHistory(${t.id}, '${t.serial_number}')" class="serial-link">${t.serial_number}</a>`;

    let columnsMiddle = "";
    if (mode === 'maintenance') columnsMiddle = `<td>${ticket}</td><td>${loc}</td>`;
    else if (mode === 'reserva') columnsMiddle = `<td><span class="badge ${badge}">${t.status}</span></td><td>${loc}</td>`;
    else columnsMiddle = `<td><span class="badge ${badge}">${t.status}</span></td><td>${ticket}</td><td>${loc}</td>`;

    return `<tr>
        <td><input type="checkbox" class="row-checkbox" ${isChecked} onchange="toggleSelection(${t.id}, this.checked)"></td>
        <td><strong>${reserveMark}${t.tombamento}</strong></td>
        <td>${t.model}</td>
        <td>${serialHtml}</td>
        ${columnsMiddle}
        <td><div class="actions-cell">${btns}</div></td>
    </tr>`;
  }).join("");
  updateBulkActionUI();
}

// --- PREENCHIMENTO ---
function fillSelects() { 
    const cities = [...new Set(professionals.map(p => p.municipality).filter(c => c))].sort();
    const cityOpts = cities.map(c => `<option value="${c}">${c}</option>`).join("");
    
    if($("#selectCityLink")) $("#selectCityLink").innerHTML = `<option value="">-- Selecione o Município --</option>` + cityOpts;
    if($("#selectCityBind")) $("#selectCityBind").innerHTML = `<option value="">-- Selecione o Município --</option>` + cityOpts;
    if($("#dlCitiesAddProf")) $("#dlCitiesAddProf").innerHTML = cityOpts;
}

window.handleStatusChange = () => {
    const status = $("#selectStatusTablet").value;
    if (status === "Reserva") $("#groupReservePin").classList.remove("hidden");
    else $("#groupReservePin").classList.add("hidden");

    if (status === "Em uso") {
        $("#sectionLinkProf").classList.remove("hidden");
        $("#selectCityLink").value = "";
        $("#groupProfSelect").classList.add("hidden");
        $("#inputProfSearch").value = "";
        $("#inputLinkDate").value = new Date().toISOString().slice(0,10);
        $("#inputAttendantName").value = "";
    } else {
        $("#sectionLinkProf").classList.add("hidden");
    }
};

window.filterProfsByCity = () => {
    const city = $("#selectCityLink").value;
    $("#inputProfSearch").value = ""; 
    if (!city) { $("#groupProfSelect").classList.add("hidden"); return; }
    const filteredProfs = professionals.filter(p => p.municipality === city);
    if (filteredProfs.length === 0) toast("Nenhum profissional encontrado nesta cidade.", "warn");
    $("#dlProfsFiltered").innerHTML = filteredProfs.map(p => `<option value="${p.name} (CPF: ${p.cpf})"></option>`).join("");
    $("#groupProfSelect").classList.remove("hidden");
};

window.filterProfsForBind = () => {
    const city = $("#selectCityBind").value;
    $("#inputProfBind").value = ""; 
    if (!city) { $("#groupProfBind").classList.add("hidden"); return; }
    const filteredProfs = professionals.filter(p => p.municipality === city);
    if (filteredProfs.length === 0) toast("Nenhum profissional encontrado nesta cidade.", "warn");
    $("#dlProfsBind").innerHTML = filteredProfs.map(p => `<option value="${p.name} (CPF: ${p.cpf})"></option>`).join("");
    $("#groupProfBind").classList.remove("hidden");
};

window.openLink = (id, t) => { 
    $("#linkTabletId").value = id; 
    $("#linkTabletName").textContent = t; 
    toggleModal("modalLink"); 
};

window.openQuickAddProf = () => toggleModal('modalAddProf');

// --- HANDLERS (COM PROTEÇÃO) ---

$("#formTablet").addEventListener("submit", async e => { 
    e.preventDefault(); 
    const d = Object.fromEntries(new FormData(e.target)); 
    const targetStatus = d.status;
    d.is_reserve = (targetStatus === "Reserva"); 
    d.status = "Disponível"; 
    if (targetStatus !== "Reserva") delete d.reserve_pin;

    let selectedProfId = null;
    if (targetStatus === "Em uso") {
        const profNameInput = $("#inputProfSearch").value;
        const attendant = $("#inputAttendantName").value;
        if (!profNameInput) return toast("Selecione um profissional.", "warn");
        if (!attendant) return toast("Informe o Atendente.", "warn");
        const found = professionals.find(p => profNameInput.includes(p.name) || profNameInput.includes(p.cpf));
        if (!found) return toast("Profissional não encontrado.", "error");
        selectedProfId = found.id;
    }

    try { 
        await api("/api/tablets", {method:"POST", body:JSON.stringify(d)}); 
        if (targetStatus === "Em uso" && selectedProfId) {
            const allTablets = await api("/api/tablets");
            const newTablet = allTablets.find(t => t.tombamento === d.tombamento);
            if (newTablet) {
                const linkData = { tablet_id: newTablet.id, professional_id: selectedProfId, start_date: $("#inputLinkDate").value, attendant_name: $("#inputAttendantName").value };
                await api("/api/assignments", {method:"POST", body:JSON.stringify(linkData)});
                toast("Salvo e Vinculado!", "success");
            }
        } else { toast("Tablet Salvo!", "success"); }
        e.target.reset(); toggleModal("modalAddTablet"); await loadAll(); 
    } catch(err){ toast(err.message, "error"); } 
});

// --- SUBMIT VINCULAR (CORRIGIDO PARA LER O NOVO CAMPO) ---
$("#formLink").addEventListener("submit", async e => { 
    e.preventDefault(); 
    try { 
        const inputProf = $("#inputProfBind");
        if (!inputProf) return toast("Erro de versão: Atualize o HTML do Modal de Vínculo.", "error");
        
        const profNameInput = inputProf.value;
        const found = professionals.find(p => profNameInput.includes(p.name) || profNameInput.includes(p.cpf));
        
        if (!found) throw new Error("Profissional não encontrado. Verifique a lista.");

        const d = {
            tablet_id: Number($("#linkTabletId").value),
            professional_id: found.id,
            start_date: e.target.start_date.value,
            attendant_name: e.target.attendant_name.value
        };

        await api("/api/assignments", {method:"POST", body:JSON.stringify(d)}); 
        toast("Vinculado!", "success"); toggleModal("modalLink"); await loadAll(); 
    } catch(err){ 
        toast(err.message, "error"); 
    } 
});

$("#formProf").addEventListener("submit", async e => { 
    e.preventDefault(); 
    try { 
        const formData = Object.fromEntries(new FormData(e.target));
        await api("/api/professionals", {method:"POST", body:JSON.stringify(formData)}); 
        toast("Profissional Salvo!", "success"); 
        e.target.reset(); toggleModal("modalAddProf"); await loadAll(); 
        
        // Atualiza campos de todos os modais abertos
        const currentCityNew = $("#selectCityLink") ? $("#selectCityLink").value : "";
        const currentCityBind = $("#selectCityBind") ? $("#selectCityBind").value : "";
        fillSelects(); 
        
        if (currentCityNew) { $("#selectCityLink").value = currentCityNew; filterProfsByCity(); }
        if (currentCityBind) { $("#selectCityBind").value = currentCityBind; filterProfsForBind(); }

    } catch(err){ toast(err.message, "error"); } 
});

// ... (RESTANTE DO CÓDIGO IGUAL) ...
window.directPrintTerm = (id) => { const tablet = tablets.find(t => t.id === id); if (!tablet) return toast("Tablet não encontrado", "error"); modeloGerador.gerarIndividual('recebimento', tablet); };
window.openBulkPrintMenu = () => { if(selectedTablets.size === 0) return toast("Nenhum item selecionado", "warn"); $("#bulkCount").textContent = selectedTablets.size; toggleModal("modalBulkPrint"); };
window.printBulkTerm = (type) => { const items = tablets.filter(t => selectedTablets.has(t.id)); if(items.length === 0) return; const cargo = $("#printRoleInput").value; modeloGerador.gerarLote(type, items, { cargo: cargo }); toggleModal("modalBulkPrint"); };
window.printDocAvulso = (tipo) => { const city = $("#selCityDoc").value; if (tipo === 'conserto') modeloGerador.gerarTermoConsertoEmBranco(city); else if (tipo === 'reserva_devolucao') modeloGerador.gerarTermoDevolucaoReservaEmBranco(city); else if (tipo === 'passo_a_passo') modeloGerador.gerarPassoPasso(); };
window.openCitySelectionModal = (type) => { printDocType = type; toggleModal("modalCitySelection"); };
window.confirmPrintBlank = () => { const city = $("#selectCityPrint").value; if (printDocType === 'conserto') modeloGerador.gerarTermoConsertoEmBranco(city); toggleModal("modalCitySelection"); };
window.toggleSelection = (id, checked) => { checked ? selectedTablets.add(id) : selectedTablets.delete(id); updateBulkActionUI(); };
window.toggleSelectAll = (mode, checked) => { const tableId = (mode === 'tablets') ? '#tableTablets' : (mode === 'reserva' ? '#tableReserva' : '#tableMaintList'); $$(tableId + " tbody input.row-checkbox").forEach(input => { input.checked = checked; const id = parseInt(input.getAttribute('onchange').match(/\d+/)[0]); checked ? selectedTablets.add(id) : selectedTablets.delete(id); }); updateBulkActionUI(); };
function updateBulkActionUI() { const count = selectedTablets.size; const sets = [{view: 'view-tablets', bar: 'bulkActionsTablets', counter: 'countSelectedTablets'}, {view: 'view-reserva', bar: 'bulkActionsReserva', counter: 'countSelectedReserva'}, {view: 'view-maintenance-list', bar: 'bulkActionsMaint', counter: 'countSelectedMaint'}]; sets.forEach(s => { if(!$(`#${s.view}`).classList.contains('hidden')) { $(`#${s.counter}`).textContent = count; if(count > 0) $(`#${s.bar}`).classList.remove('hidden'); else $(`#${s.bar}`).classList.add('hidden'); } else { $(`#${s.bar}`).classList.add('hidden'); } }); }
window.openHistory = async (id, serial) => { 
    $("#histTitle").textContent = `Histórico: ${serial}`; 
    const container = $("#timelineContainer"); 
    container.innerHTML = '<div style="text-align:center;padding:20px">Carregando...</div>'; 
    toggleModal("modalHistory"); 
    try { 
        const timeline = await api(`/api/tablets/${id}/history`); 
        if(timeline.length === 0) { container.innerHTML = '<div style="padding:20px;color:#666">Nenhum histórico encontrado.</div>'; return; } 
        const html = timeline.map(item => { 
            const dateFmt = new Date(item.date).toLocaleDateString('pt-BR'); 
            let icon = "", color = "", title = "", desc = ""; 
            if(item.type === 'create') { icon = "ph-star"; color = "bg-blue"; title = "Cadastro Inicial"; desc = "Tablet adicionado ao sistema"; } 
            else if (item.type === 'assign') { 
                icon = "ph-user"; color = "bg-green"; title = "Entregue ao Profissional"; 
                desc = `<strong>${item.info}</strong><br/>Data Início: ${dateFmt}`; 
                if(item.attendant_name) desc += `<br/><span style="font-size:12px;color:#0369a1">Entregue por: <strong>${item.attendant_name}</strong></span>`;
                if(item.reserve_pin) desc += `<br/><span style="font-size:12px;color:#6b21a8">PIN na época: <strong>${item.reserve_pin}</strong></span>`;
                if(item.end_date) desc += `<br/><span style="font-size:12px;color:#64748b">Devolvido em: ${new Date(item.end_date).toLocaleDateString('pt-BR')}</span>`; else desc += `<br/><span class="badge success" style="margin-top:4px">Ativo Agora</span>`; 
            } else if (item.type === 'maint') { 
                icon = "ph-wrench"; color = "bg-orange"; title = "Entrada em Manutenção"; 
                desc = `Motivo: ${item.info} ${item.ticket ? `(Ticket: ${item.ticket})` : ''}`; 
                if(item.end_date) desc += `<br/><span style="font-size:12px;color:#16a34a">Consertado em: ${new Date(item.end_date).toLocaleDateString('pt-BR')}</span>`; else desc += `<br/><span class="badge warn" style="margin-top:4px">Em Aberto</span>`; 
            } 
            return `<div class="timeline-item"><div class="timeline-icon ${color}"><i class="ph-bold ${icon}"></i></div><div class="timeline-content"><span class="timeline-date">${dateFmt}</span><h3>${title}</h3><p>${desc}</p></div></div>`; 
        }).join(""); 
        container.innerHTML = `<div class="timeline-wrapper">${html}</div>`; 
    } catch(e) { container.innerHTML = `<div class="alert-box warn">Erro ao carregar: ${e.message}</div>`; } 
};
function renderProfessionals() { $("#tableProfs tbody").innerHTML = professionals.map(p => `<tr><td>${p.name}</td><td>${p.cpf}</td><td>${p.municipality}</td><td><div class="actions-cell"><button class="btn-icon" onclick="deleteProf(${p.id})"><i class="ph ph-trash"></i></button></div></td></tr>`).join(""); }
window.quickUnlink = async (id) => { if(!confirm("Devolver?")) return; try { await api("/api/assignments/close", {method:"POST", body:JSON.stringify({tablet_id:id})}); toast("Devolvido!", "success"); await loadAll(); } catch(e){ toast(e.message, "error"); } };
window.openMaintEntry = (id,t) => { $("#maintEntryTabletId").value=id; $("#maintEntryTabletName").textContent=t; toggleModal("modalMaintEntry"); };
window.openMaintExit = (id,t) => { $("#maintExitTabletId").value=id; $("#maintExitTabletName").textContent=t; toggleModal("modalMaintExit"); };
window.deleteTablet = async id => { if(confirm("Excluir?")) try { await api(`/api/tablets/${id}`, {method:"DELETE"}); loadAll(); } catch(e){ toast(e.message, "error"); } };
window.deleteProf = async id => { if(confirm("Excluir?")) try { await api(`/api/professionals/${id}`, {method:"DELETE"}); loadAll(); } catch(e){ toast(e.message, "error"); } };
$("#formMaintEntry").addEventListener("submit", async e => { e.preventDefault(); try { const d = Object.fromEntries(new FormData(e.target)); d.tablet_id=Number(d.tablet_id); const r = await api("/api/maintenances/entry", {method:"POST", body:JSON.stringify(d)}); toggleModal("modalMaintEntry"); $("#mtId").value = r.maintenance_id; const profName = r.last_professional ? r.last_professional.name : "Sem dono (Estoque)"; const profCpf = r.last_professional ? r.last_professional.cpf : "N/A"; const obs = r.data.notes || "Nenhuma"; const htmlContent = `<div class="ts-row"><span>Modelo:</span> <strong>${r.tablet.model}</strong></div><div class="ts-row"><span>Tombamento:</span> <strong>${r.tablet.tombamento}</strong></div><div class="ts-row"><span>Série:</span> <strong>${r.tablet.serial_number}</strong></div><div class="ts-divider"></div><div class="ts-row"><span>Nome:</span> <strong>${profName}</strong></div><div class="ts-row"><span>CPF:</span> <strong>${profCpf}</strong></div><div class="ts-divider"></div><div class="ts-row"><span>Motivo:</span> <strong>${r.data.reason}</strong></div><div class="ts-row"><span>Obs:</span> <strong>${obs}</strong></div>`; $("#ticketSummary").innerHTML = htmlContent; const rawText = `Modelo: ${r.tablet.model}\nTombamento: ${r.tablet.tombamento}\nSérie: ${r.tablet.serial_number}\nNome: ${profName}\nCPF: ${profCpf}\nMotivo: ${r.data.reason}\nObs: ${obs}`; $("#ticketSummary").setAttribute("data-copy", rawText); toggleModal("modalTicket"); await loadAll(); } catch(err){ toast(err.message, "error"); } });
window.copyTicketData = () => { const text = $("#ticketSummary").getAttribute("data-copy"); if(!text) return; navigator.clipboard.writeText(text).then(() => toast("Copiado!", "success")).catch(() => toast("Erro ao copiar", "error")); };
$("#formMaintExit").addEventListener("submit", async e => { e.preventDefault(); try { const d = Object.fromEntries(new FormData(e.target)); d.tablet_id=Number(d.tablet_id); await api("/api/maintenances/exit", {method:"POST", body:JSON.stringify(d)}); toast("Finalizado e Restaurado!", "success"); toggleModal("modalMaintExit"); await loadAll(); } catch(err){ toast(err.message, "error"); } });
$("#formTicket").addEventListener("submit", async e => { e.preventDefault(); try { const d = Object.fromEntries(new FormData(e.target)); await api("/api/maintenances/ticket", {method:"POST", body:JSON.stringify(d)}); toast("Salvo!", "success"); toggleModal("modalTicket"); await loadAll(); } catch(err){ toast(err.message, "error"); } });
const normalize = (str) => (str || "").toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
$("#importFile").addEventListener("change", (e) => { const file = e.target.files[0]; if(!file) return; const reader = new FileReader(); reader.readAsArrayBuffer(file); reader.onload = (evt) => { try { const data = new Uint8Array(evt.target.result); currentWorkbook = XLSX.read(data, {type: 'array'}); const select = $("#sheetSelect"); select.innerHTML = `<option value="">-- Selecione a Aba --</option>`; currentWorkbook.SheetNames.forEach(name => { const opt = document.createElement("option"); opt.value = name; opt.textContent = name; select.appendChild(opt); }); $("#sheetSection").classList.remove("hidden"); } catch(err) { toast("Erro: " + err.message, "error"); } }; });
$("#sheetSelect").addEventListener("change", (e) => { const sheetName = e.target.value; if(!sheetName) return; try { const worksheet = currentWorkbook.Sheets[sheetName]; sheetMatrix = XLSX.utils.sheet_to_json(worksheet, {header: 1, raw: false, dateNF: 'dd/mm/yyyy'}); if(sheetMatrix.length === 0) throw new Error("Aba vazia."); headerRowIndex = -1; for(let i=0; i < Math.min(sheetMatrix.length, 25); i++) { const row = (sheetMatrix[i] || []).map(normalize); if(row.includes("tombamento") || row.includes("serie") || row.includes("ticket") || row.includes("tomb.antigo")) { headerRowIndex = i; break; } } if(headerRowIndex === -1) headerRowIndex = 0; const headers = sheetMatrix[headerRowIndex]; const mappers = ["mapTomb", "mapSerial", "mapModel", "mapName", "mapCpf", "mapCity", "mapUnit", "mapDate"]; mappers.forEach(id => { const select = $(`#${id}`); select.innerHTML = `<option value="">-- Ignorar --</option>`; headers.forEach((h, idx) => { const opt = document.createElement("option"); opt.value = idx; opt.textContent = `${h || "Col " + (idx+1)}`; select.appendChild(opt); }); }); autoMap(headers); $("#mappingSection").classList.remove("hidden"); $("#btnProcess").disabled = false; } catch(err) { toast(err.message, "error"); } });
function autoMap(headers) { const normHeaders = headers.map(normalize); const set = (id, keywords) => { const idx = normHeaders.findIndex(h => keywords.some(k => h.includes(k))); if(idx !== -1) $(`#${id}`).value = idx; }; set("mapTomb", ["tombamento", "tomb.antigo"]); set("mapSerial", ["serie", "imei"]); set("mapModel", ["modelo"]); set("mapName", ["nome", "acs"]); set("mapCpf", ["cpf"]); set("mapCity", ["municipio", "cidade"]); set("mapUnit", ["unidade", "posto"]); set("mapDate", ["data"]); }
window.processImport = async () => { const type = $("#importType").value; const log = $("#importLog"); const btn = $("#btnProcess"); const getIdx = (id) => { const val = $(id).value; return val === "" ? -1 : parseInt(val); }; const map = { tomb: getIdx("#mapTomb"), serial: getIdx("#mapSerial"), model: getIdx("#mapModel"), name: getIdx("#mapName"), cpf: getIdx("#mapCpf"), city: getIdx("#mapCity"), unit: getIdx("#mapUnit"), date: getIdx("#mapDate") }; if(map.tomb === -1 && map.serial === -1) return toast("É obrigatório mapear 'Tombamento' OU 'Série'!", "error"); btn.disabled = true; btn.textContent = "Processando..."; log.classList.remove("hidden"); log.innerHTML = "Lendo dados..."; try { const payload = []; const getVal = (row, idx) => (idx === -1 || !row) ? "" : (row[idx] !== undefined ? row[idx] : ""); for(let i = headerRowIndex + 1; i < sheetMatrix.length; i++) { const row = sheetMatrix[i]; if(!row) continue; const tomb = getVal(row, map.tomb); const ser = getVal(row, map.serial); if(!tomb && !ser) continue; payload.push({ tombamento: tomb, serial: ser, modelo: getVal(row, map.model), nome: getVal(row, map.name), cpf: getVal(row, map.cpf), municipio: getVal(row, map.city), unidade: getVal(row, map.unit), data_recebimento: getVal(row, map.date) }); } log.innerHTML += `<br/>Enviando ${payload.length} registros...`; const res = await api("/api/import", { method:"POST", body:JSON.stringify({ data: payload, import_mode: type }) }); log.innerHTML += `<br/><strong style="color:green">SUCESSO!</strong> Novos:${res.stats.tablets_new}, Links:${res.stats.links}`; toast("Importação Finalizada!", "success"); await loadAll(); } catch(err) { log.innerHTML += `<br/><strong style="color:red">ERRO: ${err.message}</strong>`; toast("Erro na importação", "error"); } finally { btn.disabled = false; btn.textContent = "Processar Importação"; } };
function renderCharts() { if(tablets.length===0) return; const colors={blue:'#2563eb',green:'#16a34a',orange:'#d97706',purple:'#9333ea',grey:'#cbd5e1'}; const today=new Date(); const labelsM=[]; const dataM=[]; const mCounts={}; for(let i=5;i>=0;i--){ const d=new Date(today.getFullYear(),today.getMonth()-i,1); mCounts[d.toISOString().slice(0,7)]=0; labelsM.push(d.toLocaleDateString('pt-BR',{month:'short'})); } maintenances.forEach(m=>{ const k=m.entry_date.slice(0,7); if(mCounts[k]!==undefined) mCounts[k]++; }); Object.keys(mCounts).sort().forEach(k=>dataM.push(mCounts[k])); drawChart('chartMaintHistory','line',labelsM,dataM,'Manutenções',colors.orange); const s={ 'Em uso':0,'Disponível':0,'Manutenção':0,'Reserva':0 }; tablets.forEach(t=>{ const st=normSt(t.status); if(st==='em manutenção') s['Manutenção']++; else if(t.is_reserve) s['Reserva']++; else if(st==='em uso') s['Em uso']++; else s['Disponível']++; }); drawChart('chartStatus','doughnut',Object.keys(s),Object.values(s),'Status',[colors.green,colors.grey,colors.orange,colors.purple]); const mo={}; tablets.forEach(t=>mo[t.model]=(mo[t.model]||0)+1); const sortedM=Object.entries(mo).sort((a,b)=>b[1]-a[1]).slice(0,5); drawChart('chartModels','bar',sortedM.map(x=>x[0]),sortedM.map(x=>x[1]),'Tablets',colors.blue); const ci={}; tablets.filter(t=>normSt(t.status)==='em uso').forEach(t=>ci[t.professional_municipality]=(ci[t.professional_municipality]||0)+1); const sortedC=Object.entries(ci).sort((a,b)=>b[1]-a[1]).slice(0,5); drawChart('chartCities','bar',sortedC.map(x=>x[0]),sortedC.map(x=>x[1]),'Em Uso',colors.purple); }
function drawChart(id,type,l,d,lbl,c) { const ctx=document.getElementById(id); if(!ctx)return; if(chartInstances[id]) chartInstances[id].destroy(); chartInstances[id]=new Chart(ctx,{type:type,data:{labels:l,datasets:[{label:lbl,data:d,backgroundColor:c,borderColor:Array.isArray(c)?'#fff':c,borderWidth:2,tension:0.3}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:type==='doughnut'}}}}); }
function populateFilters() { const cs=[...new Set(tablets.map(t=>t.professional_municipality).filter(c=>c))].sort(); const ms=[...new Set(tablets.map(t=>t.model).filter(m=>m))].sort(); const fill=(id,arr,p)=>{ const el=$(id); if(!el)return; const v=el.value; el.innerHTML=`<option value="">${p}</option>`+arr.map(x=>`<option value="${x}">${x}</option>`).join(""); if(arr.includes(v))el.value=v; }; fill("#filterCityTablets",cs,"Todas"); fill("#filterModelTablets",ms,"Todos"); fill("#filterCityReserva",cs,"Todas"); fill("#filterModelReserva",ms,"Todos"); fill("#filterCityMaint",cs,"Todas"); fill("#filterModelMaint",ms,"Todos"); }
loadAll();