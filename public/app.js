const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// --- UTILS ---
function toast(msg, type="info"){
  const el = $("#toast"); if(!el) return;
  el.textContent = msg; el.className = `toast`; el.classList.remove("hidden");
  if(type === 'error') el.style.backgroundColor = '#ef4444'; 
  else if(type === 'success') el.style.backgroundColor = '#10b981';
  else if(type === 'warn') el.style.backgroundColor = '#f59e0b';
  else el.style.backgroundColor = '#1f2937'; 
  setTimeout(()=> el.classList.add("hidden"), 4000);
}

const normSt = (s) => (s || "").toString().trim().toLowerCase();
function handleUpper(input) { if(input && input.value) input.value = input.value.toUpperCase(); }
function handleCpfInput(input) {
    let v = input.value.toUpperCase().replace(/\D/g,""); 
    if(v.length > 11) v = v.slice(0, 11); 
    if(v.length > 9) v = v.replace(/(\d{3})(\d{3})(\d{3})(\d{1,2})/, "$1.$2.$3-$4");
    else if(v.length > 6) v = v.replace(/(\d{3})(\d{3})(\d{1,3})/, "$1.$2.$3");
    else if(v.length > 3) v = v.replace(/(\d{3})(\d{1,3})/, "$1.$2");
    input.value = v;
}

// --- THEME LOGIC ---
function toggleTheme() {
    const html = document.documentElement;
    const current = html.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
    updateThemeIcon(next);
    renderCharts(); 
}

function updateThemeIcon(theme) {
    const label = $("#themeLabel");
    const moon = $("#moonIcon");
    const sun = $(".theme-icon:not(#moonIcon)"); 
    if (theme === 'dark') {
        label.textContent = "Modo Escuro";
        moon.classList.remove("hidden");
        sun.classList.add("hidden");
    } else {
        label.textContent = "Modo Claro";
        moon.classList.add("hidden");
        sun.classList.remove("hidden");
    }
}

(function initTheme() {
    const saved = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', saved);
    updateThemeIcon(saved);
})();

// --- API & DATA ---
async function api(url, opts={}){
  try {
    const res = await fetch(url, { headers: { "Content-Type": "application/json" }, ...opts });
    if (res.status === 401) {
      window.location.href = '/login.html';
      throw new Error('Não autenticado');
    }
    const data = await res.json().catch(()=>({}));
    if(!res.ok) throw new Error(data.error || `Erro ${res.status}`);
    return data;
  } catch(e) { throw e; }
}

let tablets = [], professionals = [], maintenances = [];
let chartInstances = {};
let selectedTablets = new Set(); 
let currentUser = null;
const modeloGerador = new Modelo(); 
let currentWorkbook = null; let headerRowIndex = 0; let sheetMatrix = [];

// --- SEARCH GLOBAL ---
const searchInput = $("#globalSearch");
const searchResults = $("#searchResults");

searchInput.addEventListener("input", async (e) => {
    const term = e.target.value;
    if(term.length < 2) { searchResults.style.display = 'none'; return; }
    
    const results = await api(`/api/search?q=${encodeURIComponent(term)}`);
    if(results.length === 0) {
        searchResults.innerHTML = `<div class="search-item"><span style="text-align:center; padding:10px">Sem resultados</span></div>`;
    } else {
        searchResults.innerHTML = results.map(item => `
            <div class="search-item" onclick="openSearchDetail('${item.type}', '${item.id}')">
                <strong>${item.title}</strong>
                <span>${item.type === 'professional' ? '👤 Profissional' : '📱 Tablet'} - ${item.subtitle}</span>
            </div>
        `).join("");
    }
    searchResults.style.display = 'block';
});

document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-container')) searchResults.style.display = 'none';
    if (!e.target.closest('.notification-wrapper')) $("#notificationDropdown").style.display = 'none';
});

window.openSearchDetail = async (type, id) => {
    searchResults.style.display = 'none';
    searchInput.value = "";
    
    let html = "";
    if (type === 'professional') {
        const profs = await api("/api/professionals");
        const p = profs.find(x => x.id == id);
        if(!p) return;
        
        const tabs = await api("/api/tablets");
        const linked = tabs.find(t => t.professional_name === p.name && t.status === 'Em uso');
        
        html = `
            <div style="text-align:center; margin-bottom:20px;">
                <div style="width:60px; height:60px; background:var(--bg-body); border-radius:50%; margin:0 auto 10px; display:flex; align-items:center; justify-content:center; font-size:24px;">👤</div>
                <h3>${p.name}</h3>
                <span style="color:var(--text-muted)">${p.municipality}</span>
            </div>
            <div class="alert-box info">
                <div style="margin-bottom:8px"><strong>CPF:</strong> ${p.cpf}</div>
                <div><strong>Vínculo Atual:</strong> ${linked ? `<span style="color:var(--success); font-weight:bold">${linked.tombamento} (${linked.model})</span>` : "Nenhum"}</div>
            </div>
        `;
    } else {
        const tabs = await api("/api/tablets");
        const t = tabs.find(x => x.id == id);
        if(!t) return;
        
        html = `
            <div style="text-align:center; margin-bottom:20px;">
                <div style="width:60px; height:60px; background:var(--bg-body); border-radius:50%; margin:0 auto 10px; display:flex; align-items:center; justify-content:center; font-size:24px;">📱</div>
                <h3>${t.tombamento}</h3>
                <span style="color:var(--text-muted)">${t.serial_number}</span>
            </div>
            <div class="alert-box ${t.status === 'Em uso' ? 'info' : 'warn'}">
                <div style="margin-bottom:4px"><strong>Status:</strong> ${t.status}</div>
                <div style="margin-bottom:4px"><strong>Modelo:</strong> ${t.model}</div>
                <div><strong>Local:</strong> ${t.professional_name || t.municipio || "Estoque"}</div>
            </div>
            <div style="margin-top:16px; text-align:center">
                <button class="btn white full" onclick="toggleModal('modalSearchDetails'); openHistory(${t.id}, '${t.serial_number}')">Ver Histórico Completo</button>
            </div>
        `;
    }
    
    $("#searchDetailsContent").innerHTML = html;
    toggleModal("modalSearchDetails");
};

// --- NOTIFICAÇÕES ---
window.toggleNotifications = async () => {
    const drop = $("#notificationDropdown");
    const isOpen = drop.style.display === 'block';
    
    if(!isOpen) {
        const logs = await api("/api/notifications");
        if(logs.length === 0) {
            drop.innerHTML = `<div style="padding:12px; text-align:center; color:var(--text-muted)">Sem notificações recentes</div>`;
        } else {
            drop.innerHTML = logs.map(l => {
                let actionColor = "var(--primary)";
                if (l.action.includes("EXCLUIR")) actionColor = "var(--danger)";
                else if (l.action.includes("NOVO")) actionColor = "var(--success)";
                return `
                <div class="notif-item">
                    <strong style="color:${actionColor}">${l.user_name}</strong>
                    ${l.details}
                    <div class="notif-time">${new Date(l.created_at).toLocaleString()}</div>
                </div>`;
            }).join("");
        }
        $("#notifDot").style.display = 'none';
        drop.style.display = 'block';
    } else {
        drop.style.display = 'none';
    }
};

// --- GESTÃO DE USUÁRIOS (Admin) ---
$("#formCreateUser").addEventListener("submit", async e => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    try {
        await api("/api/users", { method: "POST", body: JSON.stringify(d) });
        toast("Usuário criado com sucesso!", "success");
        toggleModal("modalCreateUser");
        e.target.reset();
    } catch(err) { toast(err.message, "error"); }
});

// --- NAVIGATION ---
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

// --- MODALS ---
const modalState = { openId: null, lastFocus: null, trapHandler: null };

function prepareModal(id) {
  const el = $(`#${id}`);
  if (!el) return;

  if (id === 'modalImport' && el.classList.contains('hidden')) {
    $("#importFile").value = "";
    $("#sheetSection").classList.add("hidden");
    $("#mappingSection").classList.add("hidden");
    $("#importLog").classList.add("hidden");
    $("#btnProcess").disabled = true;
    currentWorkbook = null;
  }

  if (id === 'modalLink') {
    if($("#selectCityBind")) $("#selectCityBind").value = "";
    if($("#groupProfBind")) $("#groupProfBind").classList.add("hidden");
    if($("#inputProfBind")) $("#inputProfBind").value = "";
    if($("#inputDateBind")) $("#inputDateBind").value = new Date().toISOString().slice(0,10);
  }
}

function getFocusable(container) {
  const selector = ['a[href]', 'button:not([disabled])', 'input:not([disabled])', 'select:not([disabled])', 'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])'].join(',');
  return Array.from(container.querySelectorAll(selector)).filter(el => !el.closest('.hidden') && el.offsetParent !== null);
}

function trapFocus(modalRoot) {
  const focusables = getFocusable(modalRoot);
  if (focusables.length === 0) return;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];

  modalState.trapHandler = (e) => {
    if (e.key !== 'Tab') return;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault(); last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault(); first.focus();
    }
  };
  modalRoot.addEventListener('keydown', modalState.trapHandler);
}

function releaseFocusTrap(modalRoot) {
  if (modalRoot && modalState.trapHandler) {
    modalRoot.removeEventListener('keydown', modalState.trapHandler);
  }
  modalState.trapHandler = null;
}

function openModal(id) {
  const overlay = $(`#${id}`); if (!overlay) return;
  if (modalState.openId && modalState.openId !== id) closeModal(modalState.openId);

  prepareModal(id);
  modalState.lastFocus = document.activeElement;
  modalState.openId = id;

  overlay.classList.remove('hidden');
  overlay.setAttribute('aria-hidden', 'false');
  document.body.classList.add('no-scroll');
  requestAnimationFrame(() => overlay.classList.add('is-open'));

  const modal = overlay.querySelector('.modal');
  if (modal) {
    trapFocus(modal);
    const focusables = getFocusable(modal);
    const preferred = modal.querySelector('[autofocus]') || focusables[0];
    if (preferred) setTimeout(() => preferred.focus(), 30);
  }
}

function closeModal(id) {
  const overlay = $(`#${id}`); if (!overlay) return;
  const modal = overlay.querySelector('.modal');
  if (modal) releaseFocusTrap(modal);

  overlay.classList.remove('is-open');
  overlay.setAttribute('aria-hidden', 'true');
  setTimeout(() => { overlay.classList.add('hidden'); }, 180);

  document.body.classList.remove('no-scroll');
  modalState.openId = null;
  if (modalState.lastFocus && typeof modalState.lastFocus.focus === 'function') {
    setTimeout(() => modalState.lastFocus.focus(), 0);
  }
  modalState.lastFocus = null;
}

function toggleModal(id) {
  const overlay = $(`#${id}`); if (!overlay) return;
  overlay.classList.contains('hidden') ? openModal(id) : closeModal(id);
}

(function initModalUX(){
  document.addEventListener('keydown', (e) => { if (e.key !== 'Escape') return; if (modalState.openId) closeModal(modalState.openId); });
  document.addEventListener('click', (e) => { const overlay = e.target?.closest?.('.modal-overlay'); if (!overlay) return; if (e.target === overlay) closeModal(overlay.id); });
})();

// --- DASHBOARD & CHARTS ---
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
  $("#kpiReserva").textContent = tablets.filter(t => t.is_reserve == 1 && normSt(t.status) !== "em manutenção").length;
}

function renderCharts() { 
    if(tablets.length===0 || $("#view-dashboard").classList.contains("hidden")) return; 
    
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const textColor = isDark ? '#9ca3af' : '#6b7280';
    const gridColor = isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)';
    const primary = '#7c3aed';
    
    Chart.defaults.font.family="'Poppins', sans-serif"; 
    Chart.defaults.color=textColor;
    
    const today=new Date(); 
    const labelsM=[]; const dataM=[]; const mCounts={}; 
    for(let i=5;i>=0;i--){ const d=new Date(today.getFullYear(),today.getMonth()-i,1); mCounts[d.toISOString().slice(0,7)]=0; labelsM.push(d.toLocaleDateString('pt-BR',{month:'short'})); } 
    maintenances.forEach(m=>{ const k=m.entry_date.slice(0,7); if(mCounts[k]!==undefined) mCounts[k]++; }); 
    Object.keys(mCounts).sort().forEach(k=>dataM.push(mCounts[k])); 
    drawChart('chartMaintHistory','line',labelsM,dataM,'Manutenções', primary, gridColor, true); 
    
    const s={ 'Em uso':0,'Disponível':0,'Manutenção':0,'Reserva':0 }; 
    tablets.forEach(t=>{ const st=normSt(t.status); if(st==='em manutenção') s['Manutenção']++; else if(t.is_reserve) s['Reserva']++; else if(st==='em uso') s['Em uso']++; else s['Disponível']++; }); 
    drawChart('chartStatus','doughnut',Object.keys(s),Object.values(s),'Status',['#06b6d4','#10b981','#f59e0b',primary], gridColor, false); 
    
    const mo={}; tablets.forEach(t=>mo[t.model]=(mo[t.model]||0)+1); 
    const sortedM=Object.entries(mo).sort((a,b)=>b[1]-a[1]).slice(0,5); 
    drawChart('chartModels','bar',sortedM.map(x=>x[0]),sortedM.map(x=>x[1]),'Tablets', primary, gridColor, false); 
    
    const ci={}; tablets.filter(t=>normSt(t.status)==='em uso').forEach(t=>ci[t.professional_municipality]=(ci[t.professional_municipality]||0)+1); 
    const sortedC=Object.entries(ci).sort((a,b)=>b[1]-a[1]).slice(0,5); 
    drawChart('chartCities','bar',sortedC.map(x=>x[0]),sortedC.map(x=>x[1]),'Em Uso', '#06b6d4', gridColor, false); 
}

function drawChart(id,type,l,d,lbl,c,gridC,fillArea) { 
    const ctx=document.getElementById(id); if(!ctx)return; 
    if(chartInstances[id]) chartInstances[id].destroy(); 
    
    chartInstances[id]=new Chart(ctx,{
        type:type,
        data:{
            labels:l,
            datasets:[{
                label:lbl, data:d, backgroundColor:c, 
                borderColor: (type==='line')?c:'transparent',
                borderWidth: (type==='line') ? 2 : 0,
                borderRadius: (type==='bar') ? 6 : 0,
                tension: 0.35,
                pointRadius: (type==='line')?4:0, pointBackgroundColor: '#fff', pointBorderColor: c, pointBorderWidth: 2,
                fill: fillArea ? {target: 'origin', below: hexToRgba(c, 0.2)} : false
            }]
        },
        options:{
            responsive:true, maintainAspectRatio:false,
            plugins:{
                legend:{display:type==='doughnut', position:'right', labels:{usePointStyle:true, padding:20}},
                tooltip:{backgroundColor:'#1f2937', padding:12, cornerRadius:8, titleFont:{weight:'600'}, displayColors:false}
            },
            scales:{
                y:{display:type!=='doughnut', grid:{color:gridC, borderDash:[4,4], drawBorder:false}, ticks:{padding:10}},
                x:{display:type!=='doughnut', grid:{display:false}, ticks:{padding:10}}
            }
        }
    }); 
}

function hexToRgba(hex, alpha) {
    if(Array.isArray(hex)) return hex[0]; 
    const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// --- RENDER TABLES ---
function renderTablets(mode) {
  let filtered = [], tableId = "", searchId = "", cityF = "", statusF = "";

  if (mode === 'tablets') {
    filtered = tablets.filter(t => t.is_reserve != 1 && normSt(t.status) !== "em manutenção");
    tableId = "#tableTablets"; searchId = "#searchTablets"; cityF = "#filterCityTablets"; statusF = "#filterStatusTablets";
  } else if (mode === 'reserva') {
    filtered = tablets.filter(t => t.is_reserve == 1 && normSt(t.status) !== "em manutenção");
    tableId = "#tableReserva"; searchId = "#searchReserva"; cityF = "#filterCityReserva";
  } else if (mode === 'maintenance') {
    filtered = tablets.filter(t => normSt(t.status) === "em manutenção");
    tableId = "#tableMaintList"; searchId = "#searchMaintList"; cityF = "#filterCityMaint";
  }

  const tbody = $(tableId + " tbody"); if(!tbody) return;
  const q = ($(searchId)?.value || "").toLowerCase();
  const fCity = (cityF && $(cityF)) ? $(cityF).value : "";
  const fStatus = (statusF && $(statusF)) ? $(statusF).value : "";

  const rows = filtered.filter(t => {
      const matchText = [t.tombamento, t.serial_number, t.model, t.professional_name, t.municipio].some(v => (v||"").toLowerCase().includes(q));
      if(!matchText) return false;
      if(fCity) { const cityCheck = t.is_reserve ? t.municipio : t.professional_municipality; if (cityCheck !== fCity) return false; }
      if(fStatus && normSt(t.status) !== normSt(fStatus)) return false;
      return true;
  });

  tbody.innerHTML = rows.map(t => {
    let badgeClass = "st-free"; let badgeText = t.status;
    const st = normSt(t.status);
    if(st === "em uso") badgeClass = "st-use";
    if(st === "em manutenção") badgeClass = "st-maint";
    if(t.is_reserve && st !== "em manutenção") { badgeClass = "st-res"; badgeText = "Reserva"; }

    let loc = "-";
    if(st === "em uso") {
        loc = `<div><strong>👤 ${t.professional_name||"?"}</strong><br/><span style="font-size:11px;color:var(--text-muted)">${t.professional_municipality||""}</span></div>`;
        if(t.reserve_pin) {
             loc += `<div style="margin-top:4px; font-size:11px; color:#d97706; font-weight:bold; background:#fffbeb; padding:2px 6px; border-radius:4px; display:inline-block; border:1px solid #fcd34d;">🔐 PIN: ${t.reserve_pin}</div>`;
        }
    } else if(t.is_reserve) {
        loc = t.municipio ? `<strong style="color:var(--primary)">${t.municipio}</strong>` : "DEPÓSITO CENTRAL";
    } else if(st === "em manutenção") {
        loc = `<span style="color:var(--warning)">Assistência</span>`;
    } else {
        loc = "Estoque";
    }

    // --- ACTIONS BUTTONS ---
    let btns = `<button class="btn icon" onclick="openEditTablet(${t.id})"><i class="ph-bold ph-pencil-simple"></i></button>`;
    
    // BOTÃO IMPRIMIR: Chama printDirectTerm (Individual)
    btns += `<button class="btn icon" onclick="printDirectTerm(${t.id})" title="Imprimir Termo"><i class="ph-bold ph-printer"></i></button>`;

    if (st === "disponível" || st === "reserva") btns += `<button class="btn icon" onclick="openLink(${t.id}, '${t.tombamento}')" title="Vincular"><i class="ph-bold ph-link" style="color:var(--success)"></i></button>`;
    if (st === "em uso") btns += `<button class="btn icon" onclick="quickUnlink(${t.id})" title="Devolver"><i class="ph-bold ph-link-break" style="color:var(--danger)"></i></button>`;
    if (st !== "em manutenção") btns += `<button class="btn icon" onclick="openMaintEntry(${t.id}, '${t.tombamento}')"><i class="ph-bold ph-wrench"></i></button>`;
    else btns += `<button class="btn icon" onclick="openMaintExit(${t.id}, '${t.tombamento}')"><i class="ph-fill ph-check-circle" style="color:var(--success)"></i></button>`;
    if(mode !== 'maintenance') btns += `<button class="btn icon" onclick="deleteTablet(${t.id})"><i class="ph ph-trash"></i></button>`;

    let tkt = t.ticket ? `<span style="font-size:11px; background:#f3f4f6; padding:2px 6px; border-radius:4px">${t.ticket}</span>` : "-";
    
    let mid = `<td><span class="badge-status ${badgeClass}">${badgeText}</span></td><td>${tkt}</td><td>${loc}</td>`;
    if(mode==='maintenance') mid = `<td>${tkt}</td><td>${t.professional_name || '-'}</td>`;

    return `<tr>
        <td><input type="checkbox" class="row-checkbox" data-id="${t.id}" ${selectedTablets.has(t.id)?"checked":""}></td>
        <td><strong>${t.tombamento}</strong></td>
        <td>${t.model}</td>
        <td><a href="javascript:void(0)" class="serial-link" data-action="history" data-id="${t.id}" data-serial="${t.serial_number}">${t.serial_number}</a></td>
        ${mid}
        <td><div style="display:flex;gap:6px">${btns}</div></td>
    </tr>`;
  }).join("");
  updateBulkActionUI();
}

// Delegacao de eventos
function onTableClick(e) {
  const a = e.target.closest('a.serial-link');
  if (a && a.dataset.action === 'history') {
    const id = Number(a.dataset.id);
    const serial = a.dataset.serial || '';
    openHistory(id, serial);
  }
}

function onTableChange(e) {
  const cb = e.target.closest('input.row-checkbox');
  if (!cb) return;
  const id = Number(cb.dataset.id);
  if (!Number.isFinite(id)) return;
  toggleSelection(id, cb.checked);
}

// Bind uma vez
(function bindTableDelegation(){
  ['#tableTablets', '#tableReserva', '#tableMaintList'].forEach(sel => {
    const t = document.querySelector(sel);
    if (!t) return;
    t.addEventListener('click', onTableClick);
    t.addEventListener('change', onTableChange);
  });
})();

function renderProfessionals() { 
    const q = ($("#searchProfs")?.value || "").toLowerCase();
    const rows = professionals.filter(p => p.name.toLowerCase().includes(q) || p.cpf.includes(q)).map(p => `
    <tr><td>${p.name}</td><td>${p.cpf}</td><td>${p.municipality}</td>
        <td><div style="display:flex;gap:8px">
            <button class="btn icon" onclick="openEditProf(${p.id})"><i class="ph-bold ph-pencil-simple"></i></button>
            <button class="btn icon" onclick="deleteProf(${p.id})"><i class="ph ph-trash"></i></button>
        </div></td>
    </tr>`).join("");
    $("#tableProfs tbody").innerHTML = rows;
}

// --- FORMS & ACTIONS ---
window.openAddTabletModal = () => { $("#formTablet").reset(); $("#tabletIdInput").value=""; $("#selectStatusTablet").value="Disponível"; handleStatusChange(); toggleModal('modalAddTablet'); };

// ABRIR MODAL NOVO PROFISSIONAL (Resetando Campos Extras)
window.openAddProfModal = () => {
    $("#formProf").reset();
    $("#profIdInput").value = "";
    $("#modalProfTitle").textContent = "NOVO PROFISSIONAL";
    
    // Reseta selects para padrão
    $("#inputProfRole").value = "";
    $("#inputProfUF").value = "PB";
    
    toggleModal('modalAddProf');
};

window.openQuickAddProf = () => {
    // Estamos dentro do fluxo de "Novo Tablet" e o usuário clicou no "+" para cadastrar um profissional.
    // Como o sistema permite apenas 1 modal aberto por vez, ao abrir o modal de profissional o de tablet é fechado.
    // Então: salvamos um snapshot do formulário do tablet e, após criar o profissional, reabrimos o modal do tablet
    // com os campos restaurados e o profissional já selecionado.
    const ft = $("#formTablet");
    if (ft) {
        const snap = {};
        // Captura valores de todos os campos do form (inputs/selects/textareas)
        ft.querySelectorAll("input, select, textarea").forEach(el => {
            if (!el.name && !el.id) return;
            const key = el.id || el.name;
            if (el.type === "checkbox") snap[key] = !!el.checked;
            else snap[key] = el.value;
        });

        // Campos do "Vincular Profissional" que ficam fora do form em algumas implementações
        if($("#inputProfSearch")) snap["inputProfSearch"] = $("#inputProfSearch").value;
        if($("#inputLinkDate")) snap["inputLinkDate"] = $("#inputLinkDate").value;
        if($("#inputAttendantName")) snap["inputAttendantName"] = $("#inputAttendantName").value;

        window._pendingTabletCreate = {
            from: "modalAddTablet",
            snapshot: snap,
        };
    } else {
        window._pendingTabletCreate = { from: "modalAddTablet", snapshot: null };
    }

    // Abre o modal de profissional (isso vai fechar o de tablet automaticamente)
    openAddProfModal();
};

window.openEditTablet = (id) => {
    const t = tablets.find(x => x.id === id); if(!t) return;
    $("#tabletIdInput").value = t.id; const f = $("#formTablet");
    f.tombamento.value = t.tombamento; f.serial_number.value = t.serial_number; f.model.value = t.model;
    if($("#inputTicketTablet")) $("#inputTicketTablet").value = t.ticket || "#";
    $("#selectStatusTablet").value = t.is_reserve ? "Reserva" : (normSt(t.status)==="em uso"?"Em uso":"Disponível");
    f.reserve_pin.value = t.reserve_pin || ""; if(t.is_reserve && t.municipio) $("#selectCityReserve").value = t.municipio;
    handleStatusChange(); toggleModal('modalAddTablet');
};

// IMPRESSÃO DIRETA - INDIVIDUAL (CORRIGIDA)
window.printDirectTerm = (id) => {
    const t = tablets.find(x => x.id === id);
    if(!t) return toast("Tablet não encontrado", "error");
    
    // Cria uma cópia dos dados para manipular
    const dados = { ...t };

    // --- CORREÇÃO: Garante o município correto ---
    // Tenta pegar do profissional, senão tenta do próprio tablet (reserva), senão fica vazio
    dados.municipality = dados.professional_municipality || dados.municipio || "NÃO INFORMADO";

    // 1. Mapeia CPF se necessário
    if (dados.professional_cpf) dados.cpf = dados.professional_cpf;

    // 2. Limpa o nome removendo (ACS) ou (ACE)
    if (dados.professional_name) {
        dados.professional_name = dados.professional_name
            .replace(/^\(ACS\)\s+/, "")
            .replace(/^\(ACE\)\s+/, "")
            .trim();
        dados.name = dados.professional_name;
    }

    try {
        modeloGerador.gerarIndividual('recebimento', dados);
    } catch(e) {
        console.error(e);
        toast("Erro ao gerar termo", "error");
    }
};

// ABRIR MODAL EDIÇÃO PROFISSIONAL (Separando os dados)
window.openEditProf = (id) => {
    const p = professionals.find(x => x.id === id);
    if (!p) return toast("Profissional não encontrado", "error");

    $("#profIdInput").value = p.id;
    $("#modalProfTitle").textContent = "EDITAR PROFISSIONAL";

    // Lógica para separar o Cargo do Nome
    let roleVal = "";
    let nameVal = p.name;

    if (nameVal.includes("(ACS)")) {
        roleVal = "ACS";
        nameVal = nameVal.replace("(ACS)", "").trim();
    } else if (nameVal.includes("(ACE)")) {
        roleVal = "ACE";
        nameVal = nameVal.replace("(ACE)", "").trim();
    }

    // Lógica para separar Cidade e UF
    let cityVal = p.municipality;
    let ufVal = "PB"; // Padrão

    if (cityVal && cityVal.includes(" - ")) {
        const parts = cityVal.split(" - ");
        // A última parte é a UF, o resto é cidade (pode ter hífen no nome da cidade)
        ufVal = parts.pop(); 
        cityVal = parts.join(" - ");
    }

    // Preenche o formulário
    $("#inputProfRole").value = roleVal;
    $("#inputProfName").value = nameVal;
    $("#profCpfInput").value = p.cpf;
    $("#inputProfCity").value = cityVal;
    $("#inputProfUF").value = ufVal;

    toggleModal('modalAddProf');
};

window.handleStatusChange = () => {
    const st = $("#selectStatusTablet").value;
    if(st === "Reserva") { $("#groupReservePin").classList.remove("hidden"); $("#groupCityReserve").classList.remove("hidden"); }
    else { $("#groupReservePin").classList.add("hidden"); $("#groupCityReserve").classList.add("hidden"); }
    if(st === "Em uso") $("#sectionLinkProf").classList.remove("hidden"); else $("#sectionLinkProf").classList.add("hidden");
};

// --- CORREÇÃO AQUI (Formulário do Tablet com suporte a ID temporário) ---
$("#formTablet").addEventListener("submit", async e => { 
    e.preventDefault(); 
    const d = Object.fromEntries(new FormData(e.target)); 
    const targetStatus = d.status; 
    
    d.is_reserve = (targetStatus === "Reserva"); 
    d.status = "Disponível"; 
    
    if (targetStatus === "Reserva") d.municipio = $("#selectCityReserve") ? $("#selectCityReserve").value : null; 
    else { delete d.reserve_pin; d.municipio = null; } 
    
    let selectedProfId = null; 
    
    if (targetStatus === "Em uso") { 
        // --- PRIORIZA O ID DO NOVO PROFISSIONAL ---
        if (window.tempProfId) {
            selectedProfId = window.tempProfId;
            window.tempProfId = null; // Limpa para não afetar outros cadastros
        } else {
            // Fluxo normal: busca pelo texto digitado
            const profNameInput = $("#inputProfSearch").value; 
            const attendant = $("#inputAttendantName").value; 
            
            if (!profNameInput) return toast("Selecione um profissional.", "warn"); 
            if (!attendant) return toast("Informe o Atendente.", "warn"); 
            
            const found = professionals.find(p => profNameInput.includes(p.name) || profNameInput.includes(p.cpf)); 
            if (!found) return toast("Profissional não encontrado.", "error"); 
            selectedProfId = found.id; 
        }
    } 
    
    try { 
        if(d.id) { 
            await api(`/api/tablets/${d.id}`, {method:"PUT", body:JSON.stringify(d)}); 
            toast("Tablet atualizado!", "success"); 
        } else { 
            await api("/api/tablets", {method:"POST", body:JSON.stringify(d)}); 
            
            if (targetStatus === "Em uso" && selectedProfId) { 
                const allTablets = await api("/api/tablets"); 
                const newTablet = allTablets.find(t => t.tombamento === d.tombamento); 
                
                if (newTablet) { 
                    const linkData = { 
                        tablet_id: newTablet.id, 
                        professional_id: selectedProfId, 
                        start_date: $("#inputLinkDate").value, 
                        attendant_name: $("#inputAttendantName").value 
                    }; 
                    await api("/api/assignments", {method:"POST", body:JSON.stringify(linkData)}); 
                    toast("Salvo e Vinculado!", "success"); 
                } 
            } else {
                toast("Tablet Salvo!", "success"); 
            }
        } 
        e.target.reset(); 
        toggleModal("modalAddTablet"); 
        await loadAll(); 
    } catch(err){ 
        toast(err.message, "error"); 
    } 
});

// --- CORREÇÃO AQUI (Formulário do Profissional SEM Auto-Save do Tablet) ---
$("#formProf").addEventListener("submit", async e => { 
    e.preventDefault(); 
    try { 
        const rawName = $("#inputProfName").value;
        const role = $("#inputProfRole").value;
        const rawCity = $("#inputProfCity").value;
        const uf = $("#inputProfUF").value;
        const cpf = $("#profCpfInput").value;
        const id = $("#profIdInput").value;

        let finalName = rawName;
        if (role) finalName = `(${role}) ${rawName}`;

        let finalCity = rawCity;
        if (uf && !rawCity.includes(" - ")) finalCity = `${rawCity} - ${uf}`;

        const payload = { id, name: finalName, cpf, municipality: finalCity };
        
        // 1. Salva o Profissional
        if (payload.id) {
            await api(`/api/professionals/${payload.id}`, {method:"PUT", body:JSON.stringify(payload)}); 
        } else {
            await api("/api/professionals", {method:"POST", body:JSON.stringify(payload)}); 
        }
        
        // 2. Atualiza memória
        await loadAll(); 
        fillSelects();
        
        e.target.reset(); 
        toggleModal("modalAddProf");

        // --- FLUXO: PROFISSIONAL CRIADO A PARTIR DO "+" DO NOVO TABLET ---
        const pending = window._pendingTabletCreate;
        if (pending && pending.from === "modalAddTablet") {
            // Encontra o profissional recém criado (pelo CPF que é único)
            const createdProf = professionals.find(p => p.cpf === cpf);
            if (createdProf) {
                // Guarda o ID para o formulário do Tablet usar no submit
                window.tempProfId = createdProf.id;

                // Reabre o modal do tablet e restaura o que o usuário já tinha preenchido
                openModal("modalAddTablet");

                const snap = pending.snapshot || {};
                const ft = $("#formTablet");
                if (ft) {
                    ft.querySelectorAll("input, select, textarea").forEach(el => {
                        const key = el.id || el.name;
                        if (!key || !(key in snap)) return;
                        if (el.type === "checkbox") el.checked = !!snap[key];
                        else el.value = snap[key];
                    });
                }

                // Garante "Em uso" e mostra a seção de vínculo
                if ($("#selectStatusTablet")) {
                    $("#selectStatusTablet").value = "Em uso";
                    handleStatusChange();
                }

                // Preenche o campo de busca do vínculo com o profissional recém criado
                const inputSearch = $("#inputProfSearch");
                if (inputSearch) inputSearch.value = `${createdProf.name} (CPF: ${createdProf.cpf})`;
                if ($("#inputLinkDate") && ("inputLinkDate" in snap)) $("#inputLinkDate").value = snap["inputLinkDate"] || "";
                if ($("#inputAttendantName") && ("inputAttendantName" in snap)) $("#inputAttendantName").value = snap["inputAttendantName"] || "";

                toast("Profissional criado e selecionado ✅ Agora é só salvar o Tablet.", "success");
            } else {
                toast("Profissional salvo, mas não consegui selecionar automaticamente. Selecione na lista e salve o Tablet.", "warn");
            }

            // Limpa o pending para não afetar outros fluxos
            window._pendingTabletCreate = null;
        } else {
            toast("Profissional Salvo!", "success");
        }
        // --------------------------------------------------------------

    } catch(err){ 
        toast(err.message, "error"); 
    } 
});

// PREENCHIMENTO DE LISTAS (DINÂMICO)
function fillSelects() { 
    // Cidades (Únicas)
    const cities = [...new Set(professionals.map(p => p.municipality).filter(c => c))].sort();
    const cityOpts = cities.map(c => `<option value="${c}">`).join("");
    
    // Atualiza Dropdowns de Cidades
    if($("#selectCityLink")) $("#selectCityLink").innerHTML = `<option value="">-- SELECIONE --</option>` + cities.map(c => `<option value="${c}">${c}</option>`).join("");
    if($("#selectCityBind")) $("#selectCityBind").innerHTML = `<option value="">-- SELECIONE --</option>` + cities.map(c => `<option value="${c}">${c}</option>`).join("");
    if($("#dlCitiesAddProf")) $("#dlCitiesAddProf").innerHTML = cityOpts; // DataList de Cidades
    if($("#selectCityReserve")) $("#selectCityReserve").innerHTML = `<option value="">-- DEPÓSITO CENTRAL --</option>` + cities.map(c => `<option value="${c}">${c}</option>`).join("");

    // --- NOVA LÓGICA DE UFs (APRENDER COM CADASTROS) ---
    const defaultUFs = ["PB", "PE", "RN", "SP", "RJ", "MG", "BA", "CE", "AM", "RS"];
    const learnedUFs = new Set(defaultUFs);

    // Varre profissionais para encontrar novas UFs (ex: "SANTA RITA - PB")
    professionals.forEach(p => {
        if (p.municipality && p.municipality.includes(" - ")) {
            const parts = p.municipality.split(" - ");
            const uf = parts[parts.length - 1].trim().toUpperCase();
            if (uf.length === 2) learnedUFs.add(uf);
        }
    });

    // Ordena e preenche o DataList de UF
    const sortedUFs = [...learnedUFs].sort();
    const ufOpts = sortedUFs.map(u => `<option value="${u}">`).join("");
    if($("#dlUF")) $("#dlUF").innerHTML = ufOpts;
}

window.filterProfsByCity = () => { const city = $("#selectCityLink").value; $("#inputProfSearch").value = ""; if (!city) return; const filteredProfs = professionals.filter(p => p.municipality === city); $("#dlProfsFiltered").innerHTML = filteredProfs.map(p => `<option value="${p.name} (CPF: ${p.cpf})"></option>`).join(""); };
window.filterProfsForBind = () => { const city = $("#selectCityBind").value; $("#inputProfBind").value = ""; if (city) { const filteredProfs = professionals.filter(p => p.municipality === city); $("#dlProfsBind").innerHTML = filteredProfs.map(p => `<option value="${p.name} (CPF: ${p.cpf})"></option>`).join(""); } $("#groupProfBind").classList.remove("hidden"); };

// OPEN LINK MODAL
window.openLink = (id, t) => { 
    $("#linkTabletId").value = id; 
    $("#linkTabletName").textContent = t; 
    
    // Lógica para mostrar PIN se for Reserva
    const tablet = tablets.find(x => x.id === id);
    let pinGroup = $("#groupPinLinkJS");

    if (!pinGroup) {
        const div = document.createElement("div");
        div.id = "groupPinLinkJS";
        div.className = "form-group hidden";
        div.innerHTML = `<label style="color:var(--primary);font-weight:bold;">PIN DE DESBLOQUEIO (INFORMAR AO USUÁRIO)</label><input id="inputPinLink" class="upper" readonly style="background:#f3f4f6;font-weight:bold;color:var(--text-main);border-color:var(--primary);">`;
        
        const form = $("#formLink");
        const row = form.querySelector(".row"); 
        if(row) form.insertBefore(div, row);
        else form.appendChild(div);

        pinGroup = div;
    }

    if (tablet && tablet.is_reserve) {
        pinGroup.classList.remove("hidden");
        $("#inputPinLink").value = tablet.reserve_pin || "SEM PIN CADASTRADO";
    } else {
        pinGroup.classList.add("hidden");
    }

    toggleModal("modalLink"); 
};

$("#formLink").addEventListener("submit", async e => { e.preventDefault(); try { const inputProf = $("#inputProfBind"); const selectCity = $("#selectCityBind"); const profNameInput = inputProf.value; const cityName = selectCity.value; if (!cityName && !profNameInput) return toast("Selecione Município.", "warn"); let payload = { tablet_id: Number($("#linkTabletId").value), start_date: e.target.start_date.value, attendant_name: e.target.attendant_name.value }; if (profNameInput) { const found = professionals.find(p => profNameInput.includes(p.name) || profNameInput.includes(p.cpf)); if (!found) throw new Error("Profissional não encontrado."); payload.professional_id = found.id; payload.city_mode = false; } else { if (!cityName) throw new Error("Selecione o Município."); payload.city_mode = true; payload.city_name = cityName; } await api("/api/assignments", {method:"POST", body:JSON.stringify(payload)}); toast("Vinculado!", "success"); toggleModal("modalLink"); await loadAll(); } catch(err){ toast(err.message, "error"); } });
window.quickUnlink = async (id) => { if(!confirm("Devolver?")) return; try { await api("/api/assignments/close", {method:"POST", body:JSON.stringify({tablet_id:id})}); toast("Devolvido!", "success"); await loadAll(); } catch(e){ toast(e.message, "error"); } };
window.deleteTablet = async id => { if(confirm("Excluir?")) try { await api(`/api/tablets/${id}`, {method:"DELETE"}); loadAll(); } catch(e){ toast(e.message, "error"); } };
window.deleteProf = async id => { if(confirm("Excluir?")) try { await api(`/api/professionals/${id}`, {method:"DELETE"}); loadAll(); } catch(e){ toast(e.message, "error"); } };
window.openMaintEntry = (id,t) => { $("#maintEntryTabletId").value=id; $("#maintEntryTabletName").textContent=t; toggleModal("modalMaintEntry"); };
window.openMaintExit = (id,t) => { $("#maintExitTabletId").value=id; $("#maintExitTabletName").textContent=t; toggleModal("modalMaintExit"); };

// --- MANUTENÇÃO (Correção do Erro Undefined) ---
$("#formMaintEntry").addEventListener("submit", async e => { 
    e.preventDefault(); 
    try { 
        const d = Object.fromEntries(new FormData(e.target)); 
        d.tablet_id = Number(d.tablet_id); 
        
        // CORREÇÃO: Busca dados na memória local para evitar 'undefined'
        const t = tablets.find(x => x.id === d.tablet_id);
        if (!t) throw new Error("Erro: Tablet não encontrado na lista local.");

        const r = await api("/api/maintenances/entry", {method:"POST", body:JSON.stringify(d)}); 
        
        toggleModal("modalMaintEntry"); 
        $("#mtId").value = r.maintenance_id; 
        
        // Usa dados locais (t)
        const profName = t.professional_name || "SEM DONO (ESTOQUE)"; 
        const profCpf = t.professional_cpf || "N/A"; 
        const obs = d.notes || "NENHUMA"; 
        
        const htmlContent = `MODELO: <strong>${t.model}</strong><br>PATRIMÔNIO: <strong>${t.tombamento}</strong><br>SÉRIE: <strong>${t.serial_number}</strong><hr>NOME: <strong>${profName}</strong><br>CPF: <strong>${profCpf}</strong><hr>MOTIVO: <strong>${d.reason}</strong><br>OBS: <strong>${obs}</strong>`;
        
        $("#ticketSummary").innerHTML = htmlContent; 
        
        const rawText = `MODELO: ${t.model}\nTOMBAMENTO: ${t.tombamento}\nSÉRIE: ${t.serial_number}\nNOME: ${profName}\nCPF: ${profCpf}\nMOTIVO: ${d.reason}\nOBS: ${obs}`;
        
        $("#ticketSummary").setAttribute("data-copy", rawText); 
        toggleModal("modalTicket"); 
        await loadAll(); 
    } catch(err){ 
        toast(err.message, "error"); 
    } 
});

$("#formMaintExit").addEventListener("submit", async e => { e.preventDefault(); try { const d = Object.fromEntries(new FormData(e.target)); d.tablet_id=Number(d.tablet_id); await api("/api/maintenances/exit", {method:"POST", body:JSON.stringify(d)}); toast("Restaurado!", "success"); toggleModal("modalMaintExit"); await loadAll(); } catch(err){ toast(err.message, "error"); } });
$("#formTicket").addEventListener("submit", async e => { e.preventDefault(); try { const d = Object.fromEntries(new FormData(e.target)); await api("/api/maintenances/ticket", {method:"POST", body:JSON.stringify(d)}); toast("Salvo!", "success"); toggleModal("modalTicket"); await loadAll(); } catch(err){ toast(err.message, "error"); } });
window.copyTicketData = () => { const text = $("#ticketSummary").getAttribute("data-copy"); if(!text) return; navigator.clipboard.writeText(text).then(() => toast("Copiado!", "success")); };
function populateFilters() { const cs=[...new Set(tablets.map(t=>t.professional_municipality).filter(c=>c))].sort(); const ms=[...new Set(tablets.map(t=>t.model).filter(m=>m))].sort(); const fill=(id,arr,p)=>{ const el=$(id); if(!el)return; const v=el.value; el.innerHTML=`<option value="">${p}</option>`+arr.map(x=>`<option value="${x}">${x}</option>`).join(""); if(arr.includes(v))el.value=v; }; fill("#filterCityTablets",cs,"TODAS CIDADES"); fill("#filterCityReserva",cs,"TODAS CIDADES"); fill("#filterCityMaint",cs,"TODAS CIDADES"); }

// Print functions
window.openBulkPrintMenu = () => { if(selectedTablets.size === 0) return toast("Nenhum item selecionado", "warn"); $("#bulkCount").textContent = selectedTablets.size; toggleModal("modalBulkPrint"); };

// --- CORREÇÃO DE IMPRESSÃO EM LOTE ---
window.printBulkTerm = (type) => { 
    let items = tablets.filter(t => selectedTablets.has(t.id));
    if(items.length === 0) return;

    // Normaliza os dados para o gerador (garante campo municipality e name)
    items = items.map(item => {
        return {
            ...item,
            // Prioriza professional_municipality, se não tiver, usa municipio (reserva), senão vazio
            municipality: item.professional_municipality || item.municipio || "NÃO INFORMADO",
            // Garante nome limpo
            name: (item.professional_name || "").replace(/^\(ACS\)\s+|^\(ACE\)\s+/g, "").trim()
        };
    });

    const cargo = $("#printRoleInput").value; 
    modeloGerador.gerarLote(type, items, { cargo: cargo }); 
    toggleModal("modalBulkPrint"); 
};

window.printDocAvulso = (tipo) => { const city = $("#selCityDoc").value; if (tipo === 'conserto') modeloGerador.gerarTermoConsertoEmBranco(city); else if (tipo === 'reserva_devolucao') modeloGerador.gerarTermoDevolucaoReservaEmBranco(city); else if (tipo === 'passo_a_passo') modeloGerador.gerarPassoPasso(); };
window.openCitySelectionModal = (type) => { toggleModal("modalCitySelection"); };

// --- CORREÇÃO DE DOC AVULSO (Cidade em branco) ---
window.confirmPrintBlank = () => { 
    const city = $("#selectCityPrint").value; 
    // Garante que o valor vá corretamente
    modeloGerador.gerarTermoConsertoEmBranco(city); 
    toggleModal("modalCitySelection"); 
};

window.toggleSelection = (id, checked) => { checked ? selectedTablets.add(id) : selectedTablets.delete(id); updateBulkActionUI(); };
window.toggleSelectAll = (mode, checked) => {
  const tableId = (mode === 'tablets') ? '#tableTablets' : (mode === 'reserva' ? '#tableReserva' : '#tableMaintList');
  $$(tableId + " tbody input.row-checkbox").forEach(input => {
    input.checked = checked;
    const id = Number(input.dataset.id);
    if (!Number.isFinite(id)) return;
    checked ? selectedTablets.add(id) : selectedTablets.delete(id);
  });
  updateBulkActionUI();
};
function updateBulkActionUI() { const count = selectedTablets.size; const sets = [{view: 'view-tablets', bar: 'bulkActionsTablets', counter: 'countSelectedTablets'}, {view: 'view-reserva', bar: 'bulkActionsReserva', counter: 'countSelectedReserva'}, {view: 'view-maintenance-list', bar: 'bulkActionsMaint', counter: 'countSelectedMaint'}]; sets.forEach(s => { if(!$(`#${s.view}`).classList.contains('hidden')) { $(`#${s.counter}`).textContent = count; if(count > 0) $(`#${s.bar}`).classList.remove('hidden'); else $(`#${s.bar}`).classList.add('hidden'); } else { $(`#${s.bar}`).classList.add('hidden'); } }); }

// --- FUNÇÃO DE HISTÓRICO ATUALIZADA ---
window.openHistory = async (id, serial) => {
    $("#histTitle").textContent = `Histórico: ${serial}`;
    const container = $("#timelineContainer");
    container.innerHTML = '<div style="text-align:center;padding:30px;color:var(--text-muted)">Carregando linha do tempo...</div>';
    toggleModal("modalHistory");

    try {
        const timeline = await api(`/api/tablets/${id}/history`);
        
        if (timeline.length === 0) {
            container.innerHTML = '<div style="text-align:center;padding:30px;color:var(--text-muted)">Nenhum registro encontrado.</div>';
            return;
        }

        const html = timeline.map(item => {
            const dateFmt = new Date(item.date).toLocaleDateString('pt-BR');
            let icon = "ph-info", color = "", title = item.type, desc = item.info || "";

            if (item.type === 'create') {
                icon = "ph-star-fill"; color = "purple"; title = "CADASTRO INICIAL";
                desc = "Tablet registrado no sistema.";
            } 
            else if (item.type === 'assign') {
                icon = "ph-user-fill"; color = "blue"; title = "VINCULAÇÃO / EMPRÉSTIMO";
                desc = `<strong>${item.info}</strong>`;
                if(item.attendant_name) desc += `<br>Entregue por: ${item.attendant_name}`;
                if(item.reserve_pin) desc += `<br><span style="font-size:11px;color:#d97706">PIN: ${item.reserve_pin}</span>`;
                
                // DEVOLUÇÃO
                if(item.end_date) {
                    desc += `<div style="margin-top:8px; padding-top:8px; border-top:1px dashed #e5e7eb; color:#ef4444; font-size:12px;">
                                <i class="ph-bold ph-link-break"></i> DEVOLVIDO / DESVINCULADO<br>
                                Data: ${new Date(item.end_date).toLocaleDateString('pt-BR')}
                             </div>`;
                } else {
                    desc += `<br><span class="badge-status st-use" style="margin-top:4px; display:inline-block">EM USO ATUALMENTE</span>`;
                }
            } 
            else if (item.type === 'maint') {
                icon = "ph-wrench-fill"; color = "orange"; title = "MANUTENÇÃO";
                desc = `Motivo: ${item.info}`;
                if(item.ticket) desc += ` (Ticket: ${item.ticket})`;
                if(item.end_date) desc += `<br><span style="font-size:11px;color:var(--success)">Consertado em: ${new Date(item.end_date).toLocaleDateString('pt-BR')}</span>`;
            }

            return `
            <div class="timeline-item">
                <div class="t-icon ${color}"><i class="ph ${icon}"></i></div>
                <div class="t-content">
                    <span class="t-date">${dateFmt}</span>
                    <strong class="t-title">${title}</strong>
                    <div class="t-desc">${desc}</div>
                </div>
            </div>`;
        }).join("");

        container.innerHTML = html;

    } catch (e) {
        console.error(e);
        container.innerHTML = `<div class="alert-box warn">Erro ao carregar histórico: ${e.message}</div>`;
    }
};

// Init
async function bootstrap() {
  try { await api('/api/me'); currentUser = (await api('/api/me')).user; 
      $("#userNameDisplay").textContent = currentUser.name;
      $("#userRoleDisplay").textContent = currentUser.role === 'admin' ? "Administrador" : "Técnico";
      $("#headerGreeting").textContent = `Bem-vindo de volta, ${currentUser.name.split(' ')[0]}`;
      $("#userAvatar").src = `https://ui-avatars.com/api/?name=${currentUser.name}&background=7c3aed&color=fff`;
      if(currentUser.role === 'admin') $("#btnAdminUsers").classList.remove("hidden");
  } catch (_) { return; }
  const logoutBtn = document.querySelector('.nav-item.logout');
  if (logoutBtn) { logoutBtn.addEventListener('click', async () => { try { await api('/api/logout', { method: 'POST' }); } catch (_) {} window.location.href = '/login.html'; }); }
  loadAll();
  $("#notifDot").style.display = 'block'; 
}

bootstrap();