// ---------- Estado ----------
let ITEMS = GV_STORE.get('gv_deudas_items', []);
let activePersona = 'todos';
let pendingImportData = null;
let gvChartInstance = null;
let toastTimer = null;
let gvExpanded = new Set();
let gvSort = { field: 'fecha', dir: 'desc' };
let gvChartMode = 'mes'; // 'mes' | 'año'
let gvChartOffset = 0;
let gvFileHandle = null;
let gvFileName = null;
let gvDirty = false;
let gvReconnectHandle = null;
const gvPalette = ['#f5a623', '#4f8cff', '#00d084', '#ef5b5b', '#c084fc', '#22d3ee', '#facc15', '#fb7185'];
const GV_XLSX_TYPES = [{ description: 'Libro de Excel', accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] } }];
const GV_XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const GV_OWN_SHEETS = ['Deudas'];

// ---------- Helpers ----------
function gvHtmlEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function gvFormatDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = String(iso).split('-');
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}
function gvFormatMoney(n) {
  if (n === null || n === undefined || n === '') return '—';
  return Number(n).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}
function gvDaysDiff(fromISO, toISO) { return Math.round((new Date(toISO) - new Date(fromISO)) / 86400000); }
function gvRowsOrHeader(rows, headers) { if (rows.length) return rows; const o = {}; headers.forEach(h => o[h] = ''); return [o]; }
function gvToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 1600);
}
function gvOpenModal(id) { document.getElementById(id).classList.add('open'); }
function gvCloseModal(id) { document.getElementById(id).classList.remove('open'); }
function gvRound2(n) { return Math.round((Number(n) + Number.EPSILON) * 100) / 100; }

function gvAllPersonas() {
  return Array.from(new Set(ITEMS.map(i => i.persona).filter(Boolean)));
}
function gvCatColor(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return gvPalette[h % gvPalette.length];
}

// ---------- Persistencia ----------
function gvSaveState() {
  GV_STORE.set('gv_deudas_items', ITEMS);
  gvDirty = true;
  gvRenderFileStatus();
  gvToast('Guardado en el navegador ✓');
  gvRenderAll();
}

function gvBuildSheetsRows() {
  const headers = ['Asunto', 'Persona', 'Dirección', 'Cantidad (€)', 'Fecha inicio', 'Fecha límite', 'Pagado', 'Fecha pago', 'Notas'];
  const rows = ITEMS.map(i => ({
    'Asunto': i.asunto, 'Persona': i.persona, 'Dirección': i.direccion === 'yo_debo' ? 'Yo debo' : 'Me deben',
    'Cantidad (€)': i.cantidad, 'Fecha inicio': i.fechaInicio, 'Fecha límite': i.fechaLimite,
    'Pagado': i.estado === 'pagado' ? 'TRUE' : 'FALSE', 'Fecha pago': i.fechaPago, 'Notas': i.notas
  }));
  return { headers, rows };
}

async function gvBuildMergedBuffer(handle) {
  const existingWb = await GV_IO.readWorkbookFromHandle(handle);
  const { headers, rows } = gvBuildSheetsRows();
  const wb = GV_IO.mergeAndBuildWorkbook(existingWb, GV_OWN_SHEETS, [
    { name: 'Deudas', rows: gvRowsOrHeader(rows, headers) }
  ]);
  return GV_IO.workbookToArrayBuffer(wb);
}

function gvRenderFileStatus() {
  const el = document.getElementById('fileStatus');
  if (!el) return;
  if (gvReconnectHandle && !gvFileName) {
    el.textContent = `🔗 Reconectar con ${gvReconnectHandle.name}`;
    el.className = 'file-status dirty';
    el.style.cursor = 'pointer';
    el.onclick = gvDoReconnect;
    return;
  }
  el.style.cursor = ''; el.onclick = null;
  if (!gvFileName) { el.textContent = '📄 sin archivo abierto'; el.className = 'file-status'; return; }
  el.textContent = gvDirty ? `📄 ${gvFileName} · sin guardar` : `📄 ${gvFileName} · guardado`;
  el.className = 'file-status' + (gvDirty ? ' dirty' : ' saved');
}

async function gvAdoptHandle(handle) {
  try {
    const file = await handle.getFile();
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array', cellDates: true });
    ITEMS = gvParseWorkbook(wb);
    gvFileHandle = handle; gvFileName = handle.name; gvDirty = false;
    GV_STORE.set('gv_deudas_items', ITEMS);
    gvShowApp(); gvRenderFileStatus();
    gvToast(`Conectado a: ${handle.name}`);
  } catch (err) { console.error(err); gvToast('No se pudo conectar con el archivo'); }
}
async function gvDoReconnect() {
  const handle = gvReconnectHandle;
  if (!handle) return;
  const granted = await GV_FILE.requestPermission(handle, 'readwrite');
  if (granted === 'granted') { gvReconnectHandle = null; await gvAdoptHandle(handle); }
  else gvToast('Permiso denegado');
}
async function gvTryReconnect() {
  if (!GV_FILE.supported || gvFileHandle) return;
  const handle = await GV_FILE.recallHandle();
  if (!handle) return;
  const perm = await GV_FILE.queryPermission(handle, 'readwrite');
  if (perm === 'granted') { await gvAdoptHandle(handle); }
  else { gvReconnectHandle = handle; gvRenderFileStatus(); }
}

async function gvOpenFile() {
  try {
    const res = await GV_FILE.open({ types: GV_XLSX_TYPES, accept: '.xlsx,.xls' });
    const buf = await res.file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array', cellDates: true });
    ITEMS = gvParseWorkbook(wb);
    gvFileHandle = res.handle; gvFileName = res.name; gvDirty = false; gvReconnectHandle = null;
    if (res.handle) GV_FILE.rememberHandle(res.handle);
    GV_STORE.set('gv_deudas_items', ITEMS);
    gvShowApp(); gvRenderFileStatus();
    gvToast(`Abierto: ${res.name}`);
  } catch (err) {
    if (err && err.name !== 'AbortError') { console.error(err); gvToast('No se pudo abrir el archivo'); }
  }
}
async function gvSaveFile() {
  if (gvFileHandle) {
    try {
      const buf = await gvBuildMergedBuffer(gvFileHandle);
      await GV_FILE.save(gvFileHandle, buf);
      gvDirty = false; gvRenderFileStatus(); gvToast('Guardado ✓');
    } catch (err) { console.error(err); gvToast('No se pudo guardar. Prueba "Guardar como"'); }
  } else {
    await gvSaveFileAs();
  }
}
async function gvSaveFileAs() {
  try {
    const suggested = gvFileName || 'deudas.xlsx';
    const res = await GV_FILE.saveAs(handle => gvBuildMergedBuffer(handle), suggested, { types: GV_XLSX_TYPES, mime: GV_XLSX_MIME });
    gvFileHandle = res.handle; gvFileName = res.name; gvDirty = false;
    if (res.handle) GV_FILE.rememberHandle(res.handle);
    gvRenderFileStatus();
    gvToast(GV_FILE.supported ? `Guardado como ${res.name} ✓` : 'Archivo descargado ✓');
  } catch (err) {
    if (err && err.name !== 'AbortError') { console.error(err); gvToast('No se pudo guardar el archivo'); }
  }
}
async function gvForgetFile() {
  await GV_FILE.forgetHandle();
  gvFileHandle = null; gvFileName = null; gvReconnectHandle = null; gvDirty = false;
  gvRenderFileStatus();
  gvToast('Archivo desvinculado');
}

function gvShowApp() {
  document.getElementById('emptyState').style.display = 'none';
  document.getElementById('mainContent').style.display = 'block';
  gvRenderAll();
}
function gvStartEmpty() { gvShowApp(); }

// ---------- Render principal ----------
function gvRenderAll() {
  gvRenderTabs();
  const filtered = activePersona === 'todos' ? ITEMS.slice() : ITEMS.filter(i => i.persona === activePersona);
  gvRenderStats(filtered);
  gvRenderSideCol(filtered);
  gvRenderTable();
}

function gvRenderTabs() {
  const personas = gvAllPersonas();
  if (activePersona !== 'todos' && !personas.includes(activePersona)) activePersona = 'todos';
  let html = `<button class="tab ${activePersona === 'todos' ? 'active' : ''}" data-p="todos">Todos</button>`;
  personas.forEach(p => {
    const active = activePersona === p;
    const color = gvCatColor(p);
    const dot = active ? '' : `<span class="gv-dot" style="background:${color}"></span>`;
    html += `<button class="tab ${active ? 'active' : ''}" data-p="${gvHtmlEsc(p)}" style="--accent:${color}">${dot}${gvHtmlEsc(p)}</button>`;
  });
  document.getElementById('personTabs').innerHTML = html;
}

function gvComputeStats(filtered) {
  const pendientes = filtered.filter(i => i.estado !== 'pagado');
  const meDeben = gvRound2(pendientes.filter(i => i.direccion === 'me_deben').reduce((s, i) => s + (Number(i.cantidad) || 0), 0));
  const yoDebo = gvRound2(pendientes.filter(i => i.direccion === 'yo_debo').reduce((s, i) => s + (Number(i.cantidad) || 0), 0));
  const today = new Date().toISOString().slice(0, 10);
  const conLimite = pendientes.filter(i => i.fechaLimite).sort((a, b) => a.fechaLimite.localeCompare(b.fechaLimite));
  const futuras = conLimite.filter(i => i.fechaLimite >= today);
  const proxima = futuras.length ? futuras[0] : (conLimite.length ? conLimite[conLimite.length - 1] : null);
  return { meDeben, yoDebo, pendientesCount: pendientes.length, proxima };
}

function gvRenderStats(filtered) {
  const s = gvComputeStats(filtered);
  let vHtml = '—', vClass = '';
  if (s.proxima) {
    const today = new Date().toISOString().slice(0, 10);
    const days = gvDaysDiff(today, s.proxima.fechaLimite);
    if (days < 0) { vClass = 'bad'; vHtml = 'Vencida'; }
    else if (days <= 15) { vClass = 'warn'; vHtml = `en ${days} días`; }
    else { vClass = 'good'; vHtml = gvFormatDate(s.proxima.fechaLimite); }
  }
  document.getElementById('statsRow').innerHTML = `
    <div class="stat-card"><div class="label">Me deben</div><div class="value good">${gvFormatMoney(s.meDeben)}</div></div>
    <div class="stat-card"><div class="label">Yo debo</div><div class="value bad">${gvFormatMoney(s.yoDebo)}</div></div>
    <div class="stat-card"><div class="label">Deudas pendientes</div><div class="value">${s.pendientesCount}</div></div>
    <div class="stat-card"><div class="label">Próximo vencimiento</div><div class="value ${vClass}">${vHtml}</div></div>
  `;
}

function gvMonthLabel(key) {
  const [y, m] = key.split('-');
  const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  return `${meses[parseInt(m, 10) - 1]} ${y.slice(2)}`;
}
function gvGroupedTotals(filtered, mode) {
  const meDeben = {}, yoDebo = {};
  filtered.filter(i => i.estado !== 'pagado').forEach(i => {
    if (!i.fechaInicio) return;
    const key = mode === 'año' ? i.fechaInicio.slice(0, 4) : i.fechaInicio.slice(0, 7);
    const target = i.direccion === 'yo_debo' ? yoDebo : meDeben;
    target[key] = gvRound2((target[key] || 0) + (Number(i.cantidad) || 0));
  });
  return { meDeben, yoDebo };
}
function gvChartWindow(maps, mode, offset) {
  const keys = Array.from(new Set([...Object.keys(maps.meDeben), ...Object.keys(maps.yoDebo)])).sort();
  const windowSize = mode === 'año' ? 8 : 12;
  const maxOffset = Math.max(0, keys.length - windowSize);
  const clampedOffset = Math.min(Math.max(0, offset), maxOffset);
  const end = keys.length - clampedOffset;
  const start = Math.max(0, end - windowSize);
  const windowKeys = keys.slice(start, end);
  return {
    labels: windowKeys.map(k => mode === 'año' ? k : gvMonthLabel(k)),
    meDeben: windowKeys.map(k => maps.meDeben[k] || 0),
    yoDebo: windowKeys.map(k => maps.yoDebo[k] || 0),
    clampedOffset, canPrev: start > 0, canNext: clampedOffset > 0
  };
}

function gvChartCardHtml() {
  return `
    <div class="card">
      <div class="chart-head">
        <h3 style="margin:0;">Pendiente por fecha</h3>
        <div class="chart-toggle">
          <button id="chartModeMes" class="${gvChartMode === 'mes' ? 'active' : ''}">Mes</button>
          <button id="chartModeAnio" class="${gvChartMode === 'año' ? 'active' : ''}">Año</button>
        </div>
      </div>
      <div class="chart-wrap"><canvas id="itemChart"></canvas></div>
      <div class="chart-nav" style="margin-top:.6rem; justify-content:center;">
        <button id="chartPrev" title="Periodo anterior">‹</button>
        <span id="chartRangeLabel"></span>
        <button id="chartNext" title="Periodo siguiente">›</button>
      </div>
    </div>`;
}
function gvBindChartControls(filtered) {
  document.getElementById('chartModeMes').addEventListener('click', () => { gvChartMode = 'mes'; gvChartOffset = 0; gvRenderSideColChartOnly(filtered); });
  document.getElementById('chartModeAnio').addEventListener('click', () => { gvChartMode = 'año'; gvChartOffset = 0; gvRenderSideColChartOnly(filtered); });
  document.getElementById('chartPrev').addEventListener('click', () => { gvChartOffset += 1; gvRenderSideColChartOnly(filtered); });
  document.getElementById('chartNext').addEventListener('click', () => { gvChartOffset = Math.max(0, gvChartOffset - 1); gvRenderSideColChartOnly(filtered); });
}
function gvRenderSideColChartOnly(filtered) {
  document.getElementById('chartModeMes').classList.toggle('active', gvChartMode === 'mes');
  document.getElementById('chartModeAnio').classList.toggle('active', gvChartMode === 'año');
  gvRenderChart(filtered);
}

function gvPersonaSummaryHtml(items) {
  const pendientes = items.filter(i => i.estado !== 'pagado');
  const meDeben = gvRound2(pendientes.filter(i => i.direccion === 'me_deben').reduce((s, i) => s + (Number(i.cantidad) || 0), 0));
  const yoDebo = gvRound2(pendientes.filter(i => i.direccion === 'yo_debo').reduce((s, i) => s + (Number(i.cantidad) || 0), 0));
  const neto = gvRound2(meDeben - yoDebo);
  return `
    <div class="info-row"><span class="k">Me debe</span><span class="v" style="color:var(--green);">${gvFormatMoney(meDeben)}</span></div>
    <div class="info-row"><span class="k">Le debo</span><span class="v" style="color:var(--red);">${gvFormatMoney(yoDebo)}</span></div>
    <div class="info-row"><span class="k">Balance neto</span><span class="v" style="color:${neto >= 0 ? 'var(--green)' : 'var(--red)'};">${gvFormatMoney(neto)}</span></div>
    <div class="info-row"><span class="k">Movimientos</span><span class="v">${items.length}</span></div>
  `;
}

function gvRenderPersonaList(personas) {
  const totals = personas
    .map(p => ({ p, items: ITEMS.filter(i => i.persona === p) }))
    .map(x => {
      const pend = x.items.filter(i => i.estado !== 'pagado');
      const neto = gvRound2(
        pend.filter(i => i.direccion === 'me_deben').reduce((s, i) => s + (Number(i.cantidad) || 0), 0) -
        pend.filter(i => i.direccion === 'yo_debo').reduce((s, i) => s + (Number(i.cantidad) || 0), 0)
      );
      return { ...x, neto };
    })
    .sort((a, b) => Math.abs(b.neto) - Math.abs(a.neto));
  if (!totals.length) return '<p style="color:var(--text-dim); font-size:.85rem; margin:0;">Añade una deuda para empezar.</p>';
  return `<div id="personaTotalsList">` + totals.map(t => {
    const expanded = gvExpanded.has(t.p);
    return `
      <div class="group-row ${expanded ? 'expanded' : ''}" data-p="${gvHtmlEsc(t.p)}">
        <div class="info-row">
          <span class="k"><span class="arrow">▸</span><span class="gv-dot" style="background:${gvCatColor(t.p)}"></span>${gvHtmlEsc(t.p)}</span>
          <span class="v" style="color:${t.neto >= 0 ? 'var(--green)' : 'var(--red)'};">${gvFormatMoney(t.neto)}</span>
        </div>
        ${expanded ? `<div class="group-detail">${gvPersonaSummaryHtml(t.items)}</div>` : ''}
      </div>`;
  }).join('') + `</div>`;
}

function gvOnSideColClick(e) {
  const row = e.target.closest('.group-row');
  if (row) {
    const p = row.dataset.p;
    if (gvExpanded.has(p)) gvExpanded.delete(p); else gvExpanded.add(p);
    gvRenderAll();
  }
}

function gvRenderSideCol(filtered) {
  const container = document.getElementById('sideCol');
  if (activePersona === 'todos') {
    container.innerHTML = `
      <div class="card" style="margin-bottom:1rem;">
        <h3>Por persona (neto pendiente)</h3>
        ${gvRenderPersonaList(gvAllPersonas())}
      </div>
      ${gvChartCardHtml()}`;
  } else {
    container.innerHTML = `
      <div class="card" style="margin-bottom:1rem; border-left: 3px solid ${gvCatColor(activePersona)};">
        <h3>${gvHtmlEsc(activePersona)}</h3>
        ${gvPersonaSummaryHtml(filtered)}
      </div>
      ${gvChartCardHtml()}`;
  }
  gvBindChartControls(filtered);
  gvRenderChart(filtered);
}

function gvRenderChart(filtered) {
  const ctx = document.getElementById('itemChart');
  if (!ctx) return;
  const maps = gvGroupedTotals(filtered, gvChartMode);
  const win = gvChartWindow(maps, gvChartMode, gvChartOffset);
  gvChartOffset = win.clampedOffset;
  document.getElementById('chartPrev').disabled = !win.canPrev;
  document.getElementById('chartNext').disabled = !win.canNext;
  document.getElementById('chartRangeLabel').textContent = win.labels.length ? `${win.labels[0]} – ${win.labels[win.labels.length - 1]}` : 'sin datos';
  if (gvChartInstance) gvChartInstance.destroy();
  gvChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: win.labels,
      datasets: [
        { label: 'Me deben', data: win.meDeben, backgroundColor: '#00d084', borderRadius: 4, maxBarThickness: 22 },
        { label: 'Yo debo', data: win.yoDebo, backgroundColor: '#ef5b5b', borderRadius: 4, maxBarThickness: 22 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: true, labels: { color: '#92a1bd', font: { size: 10 } } } },
      scales: {
        x: { ticks: { color: '#92a1bd', font: { family: 'JetBrains Mono', size: 10 } }, grid: { display: false } },
        y: { ticks: { color: '#92a1bd', font: { size: 10 } }, grid: { color: '#263450' } }
      }
    }
  });
}

function gvUpdateSortHeaders() {
  ['fecha', 'cantidad'].forEach(f => {
    const th = document.getElementById('th' + f.charAt(0).toUpperCase() + f.slice(1));
    const arrow = document.getElementById('arrow' + f.charAt(0).toUpperCase() + f.slice(1));
    if (!th || !arrow) return;
    if (gvSort.field === f) { th.classList.add('active'); arrow.textContent = gvSort.dir === 'asc' ? '↑' : '↓'; }
    else { th.classList.remove('active'); arrow.textContent = ''; }
  });
}
function gvOnHeaderClick(e) {
  const th = e.target.closest('.sortable');
  if (!th) return;
  const field = th.dataset.field;
  if (gvSort.field === field) gvSort.dir = gvSort.dir === 'asc' ? 'desc' : 'asc';
  else { gvSort.field = field; gvSort.dir = 'desc'; }
  gvRenderTable();
}

function gvRenderTable() {
  const q = (document.getElementById('searchInput').value || '').toLowerCase();
  let rows = activePersona === 'todos' ? ITEMS.slice() : ITEMS.filter(i => i.persona === activePersona);
  if (q) rows = rows.filter(i => (i.asunto || '').toLowerCase().includes(q) || (i.persona || '').toLowerCase().includes(q));
  rows.sort((a, b) => {
    let av, bv;
    if (gvSort.field === 'cantidad') { av = Number(a.cantidad) || 0; bv = Number(b.cantidad) || 0; }
    else { av = a.fechaInicio || ''; bv = b.fechaInicio || ''; }
    if (av < bv) return gvSort.dir === 'asc' ? -1 : 1;
    if (av > bv) return gvSort.dir === 'asc' ? 1 : -1;
    return 0;
  });
  gvUpdateSortHeaders();
  const today = new Date().toISOString().slice(0, 10);

  document.getElementById('itemsBody').innerHTML = rows.length ? rows.map(i => {
    let estadoHtml;
    if (i.estado === 'pagado') estadoHtml = `<span class="badge ok">Pagado${i.fechaPago ? ' · ' + gvFormatDate(i.fechaPago) : ''}</span>`;
    else if (i.fechaLimite) {
      const days = gvDaysDiff(today, i.fechaLimite);
      if (days < 0) estadoHtml = `<span class="badge bad">Vencida</span>`;
      else if (days <= 15) estadoHtml = `<span class="badge warn">Pendiente · ${gvFormatDate(i.fechaLimite)}</span>`;
      else estadoHtml = `<span class="badge">Pendiente · ${gvFormatDate(i.fechaLimite)}</span>`;
    } else estadoHtml = `<span class="badge">Pendiente</span>`;
    const dirColor = i.direccion === 'yo_debo' ? 'var(--red)' : 'var(--green)';
    const dirLabel = i.direccion === 'yo_debo' ? 'Yo debo' : 'Me deben';
    return `<tr data-id="${i.id}">
      <td>${gvFormatDate(i.fechaInicio)}</td>
      <td>${gvHtmlEsc(i.persona || '')}<div style="color:${dirColor}; font-size:.74rem; margin-top:.2rem;">${dirLabel}</div></td>
      <td>${gvHtmlEsc(i.asunto || '')}</td>
      <td class="num" style="color:${dirColor};">${gvFormatMoney(i.cantidad)}</td>
      <td>${estadoHtml}</td>
      <td class="row-actions"><button data-action="edit" title="Editar">✎</button><button data-action="delete" title="Eliminar">🗑</button></td>
    </tr>`;
  }).join('') : `<tr><td colspan="6" style="text-align:center; color:var(--text-dim); padding:2rem 0;">No hay deudas que coincidan.</td></tr>`;
}

// ---------- Interacciones ----------
function gvOnTabsClick(e) {
  const tab = e.target.closest('.tab[data-p]');
  if (tab) { activePersona = tab.dataset.p; gvChartOffset = 0; gvRenderAll(); }
}
function gvOnTableClick(e) {
  const tr = e.target.closest('tr[data-id]');
  if (!tr) return;
  const id = tr.dataset.id;
  if (e.target.closest('[data-action="edit"]')) {
    const item = ITEMS.find(x => x.id === id);
    if (item) gvOpenItemModal(item);
  } else if (e.target.closest('[data-action="delete"]')) {
    if (confirm('¿Eliminar esta deuda?')) { ITEMS = ITEMS.filter(x => x.id !== id); gvSaveState(); }
  }
}

// ---------- Modal ----------
function gvToggleFechaPago() {
  document.getElementById('fechaPagoField').style.display = document.getElementById('itemEstado').value === 'pagado' ? 'block' : 'none';
}

function gvOpenItemModal(item) {
  document.getElementById('personaList').innerHTML = gvAllPersonas().map(p => `<option value="${gvHtmlEsc(p)}"></option>`).join('');
  document.getElementById('itemModalTitle').textContent = item ? 'Editar deuda' : 'Añadir deuda';
  document.getElementById('itemId').value = item ? item.id : '';
  document.getElementById('itemAsunto').value = item ? item.asunto : '';
  document.getElementById('itemPersona').value = item ? item.persona : (activePersona !== 'todos' ? activePersona : '');
  document.getElementById('itemDireccion').value = item ? item.direccion : 'me_deben';
  document.getElementById('itemCantidad').value = item ? (item.cantidad ?? '') : '';
  document.getElementById('itemFechaInicio').value = item ? (item.fechaInicio || '') : new Date().toISOString().slice(0, 10);
  document.getElementById('itemFechaLimite').value = item ? (item.fechaLimite || '') : '';
  document.getElementById('itemEstado').value = item ? item.estado : 'pendiente';
  document.getElementById('itemFechaPago').value = item ? (item.fechaPago || '') : '';
  document.getElementById('itemNotas').value = item ? (item.notas || '') : '';
  document.getElementById('itemDeleteBtn').style.display = item ? 'inline-flex' : 'none';
  gvToggleFechaPago();
  gvOpenModal('itemOverlay');
}

function gvSaveItem() {
  const id = document.getElementById('itemId').value;
  const asunto = document.getElementById('itemAsunto').value.trim();
  const persona = document.getElementById('itemPersona').value.trim();
  if (!asunto) { gvToast('Escribe el asunto'); return; }
  if (!persona) { gvToast('Escribe con quién es la deuda'); return; }
  const estado = document.getElementById('itemEstado').value;
  const obj = {
    id: id || GV_STORE.uid(),
    asunto, persona,
    direccion: document.getElementById('itemDireccion').value,
    cantidad: GV_IO.toNumber(document.getElementById('itemCantidad').value),
    fechaInicio: document.getElementById('itemFechaInicio').value,
    fechaLimite: document.getElementById('itemFechaLimite').value,
    estado,
    fechaPago: estado === 'pagado' ? document.getElementById('itemFechaPago').value : '',
    notas: document.getElementById('itemNotas').value.trim()
  };
  if (id) { const idx = ITEMS.findIndex(i => i.id === id); if (idx > -1) ITEMS[idx] = obj; }
  else ITEMS.push(obj);
  gvCloseModal('itemOverlay');
  gvSaveState();
}

function gvDeleteItem() {
  const id = document.getElementById('itemId').value;
  if (!id || !confirm('¿Eliminar esta deuda?')) return;
  ITEMS = ITEMS.filter(i => i.id !== id);
  gvCloseModal('itemOverlay');
  gvSaveState();
}

// ---------- Importar / abrir ----------
function gvSetupDropzone() {
  const dz = document.getElementById('emptyState');
  ['dragenter', 'dragover'].forEach(evt => dz.addEventListener(evt, e => { e.preventDefault(); dz.classList.add('drag'); }));
  ['dragleave', 'drop'].forEach(evt => dz.addEventListener(evt, e => { e.preventDefault(); dz.classList.remove('drag'); }));
  dz.addEventListener('drop', e => { const f = e.dataTransfer.files[0]; if (f) gvProcessFile(f); });
}

function gvNormalizeDireccion(raw, persona) {
  const s = String(raw).trim().toLowerCase();
  if (s.includes('yo debo') || s.includes('yo a')) return 'yo_debo';
  if (s.includes('me deben') || s.includes('deben')) return 'me_deben';
  // Heurística sobre el formato antiguo ("Yo a Mama" en la columna Persona)
  if (/^yo a /i.test(String(persona))) return 'yo_debo';
  return 'me_deben';
}
function gvNormalizePersona(raw) {
  return String(raw).replace(/^yo a /i, '').trim();
}
function gvNormalizePagado(raw) {
  const s = String(raw).trim().toLowerCase();
  return ['true', '1', 'sí', 'si', 'pagado'].includes(s) ? 'pagado' : 'pendiente';
}

function gvParseWorkbook(wb) {
  const sheetName = wb.SheetNames.find(n => /deuda/i.test(n)) || wb.SheetNames[0];
  const rows = GV_IO.sheetToRows(wb.Sheets[sheetName]);
  const pick = (row, keys) => { for (const k of keys) { if (row[k] !== undefined && row[k] !== '') return row[k]; } return ''; };

  return rows.map(row => {
    const personaRaw = pick(row, ['Persona', 'Deudor']);
    return {
      id: GV_STORE.uid(),
      asunto: String(pick(row, ['Asunto'])).trim(),
      persona: gvNormalizePersona(personaRaw),
      direccion: gvNormalizeDireccion(pick(row, ['Dirección', 'Direccion']), personaRaw),
      cantidad: GV_IO.toNumber(pick(row, ['Cantidad (€)', 'Cantidad'])),
      fechaInicio: GV_IO.excelDateToISO(pick(row, ['Fecha inicio', 'Fecha Inicio'])),
      fechaLimite: GV_IO.excelDateToISO(pick(row, ['Fecha límite', 'Fecha Final', 'Fecha final'])),
      estado: gvNormalizePagado(pick(row, ['Pagado'])),
      fechaPago: GV_IO.excelDateToISO(pick(row, ['Fecha pago', 'Fecha Pago'])),
      notas: String(pick(row, ['Notas'])).trim()
    };
  }).filter(i => i.asunto || i.persona);
}

function gvProcessFile(file) {
  GV_IO.readWorkbookFromFile(file).then(wb => {
    const newItems = gvParseWorkbook(wb);
    if (ITEMS.length > 0) {
      pendingImportData = newItems;
      gvOpenModal('importOverlay');
    } else {
      ITEMS = newItems;
      gvShowApp();
      gvSaveState();
      gvToast(`Importadas ${newItems.length} deuda(s) ✓`);
    }
  }).catch(err => { console.error(err); gvToast('No se pudo leer el archivo'); });
}

function gvResolveImport(mode) {
  if (!pendingImportData) return;
  if (mode === 'reemplazar') {
    ITEMS = pendingImportData;
  } else {
    const sig = i => [i.persona, i.asunto, i.fechaInicio, i.cantidad].join('|').toLowerCase();
    const existing = new Set(ITEMS.map(sig));
    pendingImportData.forEach(i => { if (!existing.has(sig(i))) ITEMS.push(i); });
  }
  pendingImportData = null;
  gvCloseModal('importOverlay');
  gvShowApp();
  gvSaveState();
  gvToast('Datos importados ✓');
}

function gvExport(format) {
  if (ITEMS.length === 0) { gvToast('No hay datos para exportar'); return; }
  const { headers, rows } = gvBuildSheetsRows();
  if (format === 'csv') GV_IO.downloadCSV(gvRowsOrHeader(rows, headers), 'deudas.csv');
  else GV_IO.downloadWorkbook([{ name: 'Deudas', rows: gvRowsOrHeader(rows, headers) }], 'deudas.xlsx');
  const menu = document.getElementById('fileMenu');
  if (menu) menu.classList.remove('open');
  gvToast('Descargado ✓');
}

// ---------- Barra de acciones superior ----------
function gvRenderTopActions() {
  document.getElementById('topActions').innerHTML = `
    <span class="file-status" id="fileStatus">📄 sin archivo abierto</span>
    <button class="btn primary small" id="btnSaveFile">💾 Guardar</button>
    <div class="menu-wrap">
      <button class="btn ghost small" id="btnFileMenu">Archivo ▾</button>
      <div class="menu" id="fileMenu">
        <button id="mOpen">📂 Abrir archivo (.xlsx)</button>
        <button id="mSaveAs">Guardar como (.xlsx)…</button>
        <div class="menu-sep"></div>
        <button id="mImport">📥 Importar y combinar (Excel/CSV)</button>
        <button id="mExportCsv">⬇ Exportar a .csv</button>
        <div class="menu-sep"></div>
        <button id="mTemplate">🧾 Descargar plantilla</button>
        <div class="menu-sep"></div>
        <button id="mForget">🔌 Olvidar archivo vinculado</button>
      </div>
    </div>
  `;
  document.getElementById('btnSaveFile').addEventListener('click', gvSaveFile);
  document.getElementById('btnFileMenu').addEventListener('click', e => { e.stopPropagation(); document.getElementById('fileMenu').classList.toggle('open'); });
  document.getElementById('mOpen').addEventListener('click', () => { document.getElementById('fileMenu').classList.remove('open'); gvOpenFile(); });
  document.getElementById('mSaveAs').addEventListener('click', () => { document.getElementById('fileMenu').classList.remove('open'); gvSaveFileAs(); });
  document.getElementById('mImport').addEventListener('click', () => {
    document.getElementById('fileMenu').classList.remove('open');
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.xlsx,.xls,.csv';
    input.onchange = () => { const f = input.files[0]; if (f) gvProcessFile(f); };
    input.click();
  });
  document.getElementById('mExportCsv').addEventListener('click', () => { document.getElementById('fileMenu').classList.remove('open'); gvExport('csv'); });
  document.getElementById('mTemplate').addEventListener('click', () => { document.getElementById('fileMenu').classList.remove('open'); gvDownloadFullTemplate(); });
  document.getElementById('mForget').addEventListener('click', () => { document.getElementById('fileMenu').classList.remove('open'); gvForgetFile(); });
  gvRenderFileStatus();
}
document.addEventListener('click', () => { const m = document.getElementById('fileMenu'); if (m) m.classList.remove('open'); });

window.addEventListener('beforeunload', e => {
  if (gvDirty && gvFileName) { e.preventDefault(); e.returnValue = ''; }
});

// ---------- Init ----------
function gvInit() {
  gvRenderTopActions();
  document.getElementById('fileInput').addEventListener('change', e => { const f = e.target.files[0]; if (f) gvProcessFile(f); e.target.value = ''; });
  gvSetupDropzone();
  document.getElementById('searchInput').addEventListener('input', gvRenderTable);
  document.getElementById('personTabs').addEventListener('click', gvOnTabsClick);
  document.getElementById('itemsBody').addEventListener('click', gvOnTableClick);
  document.getElementById('sideCol').addEventListener('click', gvOnSideColClick);
  document.querySelector('#itemsTable thead').addEventListener('click', gvOnHeaderClick);

  if (ITEMS.length > 0) gvShowApp();
  else document.getElementById('emptyState').style.display = 'block';
  gvTryReconnect();
}
document.addEventListener('DOMContentLoaded', gvInit);
