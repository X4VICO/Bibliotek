// ---------- Estado ----------
let ITEMS = GV_STORE.get('gv_laboral_items', []);
let activeTipo = 'todos';
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
const gvPalette = ['#c084fc', '#4f8cff', '#00d084', '#f5a623', '#ef5b5b', '#22d3ee', '#facc15', '#fb7185'];
const GV_XLSX_TYPES = [{ description: 'Libro de Excel', accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] } }];
const GV_XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const GV_OWN_SHEETS = ['Vida Laboral'];

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

function gvAllTipos() { return Array.from(new Set(ITEMS.map(i => i.tipoContrato).filter(Boolean))); }
function gvCatColor(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return gvPalette[h % gvPalette.length];
}

function gvDurationMonths(startISO, endISO) {
  if (!startISO) return 0;
  const start = new Date(startISO);
  const end = endISO ? new Date(endISO) : new Date();
  let months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
  if (end.getDate() < start.getDate()) months--;
  return Math.max(0, months);
}
function gvDurationLabel(months) {
  const years = Math.floor(months / 12), rem = months % 12;
  if (years > 0 && rem > 0) return `${years}a ${rem}m`;
  if (years > 0) return `${years}a`;
  return `${months}m`;
}

// ---------- Persistencia ----------
function gvSaveState() {
  GV_STORE.set('gv_laboral_items', ITEMS);
  gvDirty = true;
  gvRenderFileStatus();
  gvToast('Guardado en el navegador ✓');
  gvRenderAll();
}

function gvBuildSheetsRows() {
  const headers = ['Empresa', 'Puesto', 'Fecha inicio', 'Fecha final', 'Tipo de contrato', 'Modalidad', 'Notas'];
  const rows = ITEMS.map(i => ({
    'Empresa': i.empresa, 'Puesto': i.puesto, 'Fecha inicio': i.fechaInicio, 'Fecha final': i.fechaFin,
    'Tipo de contrato': i.tipoContrato, 'Modalidad': i.modalidad, 'Notas': i.notas
  }));
  return { headers, rows };
}

async function gvBuildMergedBuffer(handle) {
  const existingWb = await GV_IO.readWorkbookFromHandle(handle);
  const { headers, rows } = gvBuildSheetsRows();
  const wb = GV_IO.mergeAndBuildWorkbook(existingWb, GV_OWN_SHEETS, [
    { name: 'Vida Laboral', rows: gvRowsOrHeader(rows, headers) }
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
    GV_STORE.set('gv_laboral_items', ITEMS);
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
    GV_STORE.set('gv_laboral_items', ITEMS);
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
    const suggested = gvFileName || 'vida-laboral.xlsx';
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
  gvRenderTimeline();
  gvRenderTabs();
  const filtered = activeTipo === 'todos' ? ITEMS.slice() : ITEMS.filter(i => i.tipoContrato === activeTipo);
  gvRenderStats(filtered);
  gvRenderSideCol(filtered);
  gvRenderTable();
}

function gvComputeTimeline(items) {
  const withDates = items.filter(i => i.fechaInicio).slice().sort((a, b) => a.fechaInicio.localeCompare(b.fechaInicio));
  if (!withDates.length) return [];
  const minDate = new Date(withDates[0].fechaInicio);
  let maxDate = minDate;
  withDates.forEach(i => { const end = i.fechaFin ? new Date(i.fechaFin) : new Date(); if (end > maxDate) maxDate = end; });
  const totalMonths = Math.max(1, gvDurationMonths(minDate.toISOString().slice(0, 10), maxDate.toISOString().slice(0, 10)));
  return withDates.map(i => {
    const offset = gvDurationMonths(minDate.toISOString().slice(0, 10), i.fechaInicio);
    const dur = Math.max(1, gvDurationMonths(i.fechaInicio, i.fechaFin || null));
    const leftPct = (offset / totalMonths) * 100;
    const widthPct = Math.min(100 - leftPct, (dur / totalMonths) * 100);
    return { item: i, leftPct, widthPct };
  });
}

function gvRenderTimeline() {
  const wrap = document.getElementById('timelineWrap');
  const bars = gvComputeTimeline(ITEMS);
  if (!bars.length) {
    wrap.innerHTML = '<p style="color:var(--text-dim); font-size:.85rem; margin:0;">Añade una experiencia para ver la línea de tiempo.</p>';
    return;
  }
  wrap.innerHTML = bars.map(b => {
    const color = gvCatColor(b.item.tipoContrato || 'Otro');
    const dur = gvDurationLabel(gvDurationMonths(b.item.fechaInicio, b.item.fechaFin || null));
    const title = `${b.item.empresa} — ${gvFormatDate(b.item.fechaInicio)} a ${b.item.fechaFin ? gvFormatDate(b.item.fechaFin) : 'hoy'} (${dur})`;
    return `<div class="timeline-row">
      <div class="timeline-label" title="${gvHtmlEsc(b.item.empresa)}">${gvHtmlEsc(b.item.empresa)}</div>
      <div class="timeline-track">
        <div class="timeline-bar" style="left:${b.leftPct}%; width:${b.widthPct}%; background:${color};" title="${gvHtmlEsc(title)}"></div>
      </div>
    </div>`;
  }).join('');
}

function gvRenderTabs() {
  const tipos = gvAllTipos();
  if (activeTipo !== 'todos' && !tipos.includes(activeTipo)) activeTipo = 'todos';
  let html = `<button class="tab ${activeTipo === 'todos' ? 'active' : ''}" data-t="todos">Todos</button>`;
  tipos.forEach(t => {
    const active = activeTipo === t;
    const color = gvCatColor(t);
    const dot = active ? '' : `<span class="gv-dot" style="background:${color}"></span>`;
    html += `<button class="tab ${active ? 'active' : ''}" data-t="${gvHtmlEsc(t)}" style="--accent:${color}">${dot}${gvHtmlEsc(t)}</button>`;
  });
  document.getElementById('tipoTabs').innerHTML = html;
}

function gvComputeStats(filtered) {
  const totalMeses = filtered.reduce((s, i) => s + gvDurationMonths(i.fechaInicio, i.fechaFin || null), 0);
  const empresas = new Set(filtered.map(i => i.empresa).filter(Boolean));
  const actual = filtered.find(i => !i.fechaFin);
  const media = filtered.length ? Math.round(totalMeses / filtered.length) : 0;
  return { totalMeses, nEmpresas: empresas.size, actual, media };
}

function gvRenderStats(filtered) {
  const s = gvComputeStats(filtered);
  document.getElementById('statsRow').innerHTML = `
    <div class="stat-card"><div class="label">Experiencia total</div><div class="value">${gvDurationLabel(s.totalMeses)}</div></div>
    <div class="stat-card"><div class="label">Empresas</div><div class="value">${s.nEmpresas}</div></div>
    <div class="stat-card"><div class="label">Duración media</div><div class="value">${gvDurationLabel(s.media)}</div></div>
    <div class="stat-card"><div class="label">Empleo actual</div><div class="value good" style="font-size:1.05rem;">${s.actual ? gvHtmlEsc(s.actual.empresa) : '—'}</div></div>
  `;
}

function gvMonthLabel(key) {
  const [y, m] = key.split('-');
  const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  return `${meses[parseInt(m, 10) - 1]} ${y.slice(2)}`;
}
function gvGroupedTotals(filtered, mode) {
  const map = {};
  filtered.forEach(i => {
    if (!i.fechaInicio) return;
    const key = mode === 'año' ? i.fechaInicio.slice(0, 4) : i.fechaInicio.slice(0, 7);
    const dur = gvDurationMonths(i.fechaInicio, i.fechaFin || null);
    map[key] = (map[key] || 0) + dur;
  });
  return map;
}
function gvChartWindow(map, mode, offset) {
  const keys = Object.keys(map).sort();
  const windowSize = mode === 'año' ? 8 : 12;
  const maxOffset = Math.max(0, keys.length - windowSize);
  const clampedOffset = Math.min(Math.max(0, offset), maxOffset);
  const end = keys.length - clampedOffset;
  const start = Math.max(0, end - windowSize);
  const windowKeys = keys.slice(start, end);
  return {
    labels: windowKeys.map(k => mode === 'año' ? k : gvMonthLabel(k)),
    data: windowKeys.map(k => map[k]),
    clampedOffset, canPrev: start > 0, canNext: clampedOffset > 0
  };
}

function gvChartCardHtml() {
  return `
    <div class="card">
      <div class="chart-head">
        <h3 style="margin:0;">Meses trabajados</h3>
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

function gvTipoSummaryHtml(items) {
  const totalMeses = items.reduce((s, i) => s + gvDurationMonths(i.fechaInicio, i.fechaFin || null), 0);
  const empresas = new Set(items.map(i => i.empresa).filter(Boolean));
  return `
    <div class="info-row"><span class="k">Experiencias</span><span class="v">${items.length}</span></div>
    <div class="info-row"><span class="k">Empresas distintas</span><span class="v">${empresas.size}</span></div>
    <div class="info-row"><span class="k">Tiempo total</span><span class="v">${gvDurationLabel(totalMeses)}</span></div>
  `;
}
function gvRenderTipoList(tipos) {
  const totals = tipos
    .map(t => ({ t, items: ITEMS.filter(i => i.tipoContrato === t) }))
    .map(x => ({ ...x, meses: x.items.reduce((s, i) => s + gvDurationMonths(i.fechaInicio, i.fechaFin || null), 0) }))
    .sort((a, b) => b.meses - a.meses);
  if (!totals.length) return '<p style="color:var(--text-dim); font-size:.85rem; margin:0;">Añade una experiencia para empezar.</p>';
  return `<div id="tipoTotalsList">` + totals.map(x => {
    const expanded = gvExpanded.has(x.t);
    return `
      <div class="group-row ${expanded ? 'expanded' : ''}" data-t="${gvHtmlEsc(x.t)}">
        <div class="info-row">
          <span class="k"><span class="arrow">▸</span><span class="gv-dot" style="background:${gvCatColor(x.t)}"></span>${gvHtmlEsc(x.t)}</span>
          <span class="v">${gvDurationLabel(x.meses)}</span>
        </div>
        ${expanded ? `<div class="group-detail">${gvTipoSummaryHtml(x.items)}</div>` : ''}
      </div>`;
  }).join('') + `</div>`;
}
function gvOnSideColClick(e) {
  const row = e.target.closest('.group-row');
  if (row) {
    const t = row.dataset.t;
    if (gvExpanded.has(t)) gvExpanded.delete(t); else gvExpanded.add(t);
    gvRenderAll();
  }
}

function gvRenderSideCol(filtered) {
  const container = document.getElementById('sideCol');
  if (activeTipo === 'todos') {
    container.innerHTML = `
      <div class="card" style="margin-bottom:1rem;">
        <h3>Por tipo de contrato</h3>
        ${gvRenderTipoList(gvAllTipos())}
      </div>
      ${gvChartCardHtml()}`;
  } else {
    container.innerHTML = `
      <div class="card" style="margin-bottom:1rem; border-left: 3px solid ${gvCatColor(activeTipo)};">
        <h3>${gvHtmlEsc(activeTipo)}</h3>
        ${gvTipoSummaryHtml(filtered)}
      </div>
      ${gvChartCardHtml()}`;
  }
  gvBindChartControls(filtered);
  gvRenderChart(filtered);
}

function gvRenderChart(filtered) {
  const ctx = document.getElementById('itemChart');
  if (!ctx) return;
  const map = gvGroupedTotals(filtered, gvChartMode);
  const win = gvChartWindow(map, gvChartMode, gvChartOffset);
  gvChartOffset = win.clampedOffset;
  document.getElementById('chartPrev').disabled = !win.canPrev;
  document.getElementById('chartNext').disabled = !win.canNext;
  document.getElementById('chartRangeLabel').textContent = win.labels.length ? `${win.labels[0]} – ${win.labels[win.labels.length - 1]}` : 'sin datos';
  const barColor = activeTipo === 'todos' ? '#c084fc' : gvCatColor(activeTipo);
  if (gvChartInstance) gvChartInstance.destroy();
  gvChartInstance = new Chart(ctx, {
    type: 'bar',
    data: { labels: win.labels, datasets: [{ label: 'meses', data: win.data, backgroundColor: barColor, borderRadius: 4, maxBarThickness: 28 }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: '#92a1bd', font: { family: 'JetBrains Mono', size: 10 } }, grid: { display: false } },
        y: { ticks: { color: '#92a1bd', font: { size: 10 }, precision: 0 }, grid: { color: '#263450' } }
      }
    }
  });
}

function gvUpdateSortHeaders() {
  ['fecha', 'duracion'].forEach(f => {
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
  let rows = activeTipo === 'todos' ? ITEMS.slice() : ITEMS.filter(i => i.tipoContrato === activeTipo);
  if (q) rows = rows.filter(i => (i.empresa || '').toLowerCase().includes(q) || (i.puesto || '').toLowerCase().includes(q));
  rows.sort((a, b) => {
    let av, bv;
    if (gvSort.field === 'duracion') { av = gvDurationMonths(a.fechaInicio, a.fechaFin || null); bv = gvDurationMonths(b.fechaInicio, b.fechaFin || null); }
    else { av = a.fechaInicio || ''; bv = b.fechaInicio || ''; }
    if (av < bv) return gvSort.dir === 'asc' ? -1 : 1;
    if (av > bv) return gvSort.dir === 'asc' ? 1 : -1;
    return 0;
  });
  gvUpdateSortHeaders();

  document.getElementById('itemsBody').innerHTML = rows.length ? rows.map(i => {
    const months = gvDurationMonths(i.fechaInicio, i.fechaFin || null);
    const enCurso = !i.fechaFin;
    return `<tr data-id="${i.id}">
      <td>${gvFormatDate(i.fechaInicio)}</td>
      <td>${gvHtmlEsc(i.empresa || '')}</td>
      <td>${gvHtmlEsc(i.puesto || '')}<div style="color:var(--text-dim); font-size:.76rem; margin-top:.2rem;">${gvHtmlEsc(i.modalidad || '')}</div></td>
      <td><span class="badge" style="color:${gvCatColor(i.tipoContrato || 'Otro')}; border-color:${gvCatColor(i.tipoContrato || 'Otro')}66;">${gvHtmlEsc(i.tipoContrato || '—')}</span></td>
      <td>${enCurso ? `<span class="badge ok">en curso · ${gvDurationLabel(months)}</span>` : gvDurationLabel(months)}</td>
      <td class="row-actions"><button data-action="edit" title="Editar">✎</button><button data-action="delete" title="Eliminar">🗑</button></td>
    </tr>`;
  }).join('') : `<tr><td colspan="6" style="text-align:center; color:var(--text-dim); padding:2rem 0;">No hay experiencias que coincidan.</td></tr>`;
}

// ---------- Interacciones ----------
function gvOnTabsClick(e) {
  const tab = e.target.closest('.tab[data-t]');
  if (tab) { activeTipo = tab.dataset.t; gvChartOffset = 0; gvRenderAll(); }
}
function gvOnTableClick(e) {
  const tr = e.target.closest('tr[data-id]');
  if (!tr) return;
  const id = tr.dataset.id;
  if (e.target.closest('[data-action="edit"]')) {
    const item = ITEMS.find(x => x.id === id);
    if (item) gvOpenItemModal(item);
  } else if (e.target.closest('[data-action="delete"]')) {
    if (confirm('¿Eliminar esta experiencia?')) { ITEMS = ITEMS.filter(x => x.id !== id); gvSaveState(); }
  }
}

// ---------- Modal ----------
function gvOpenItemModal(item) {
  document.getElementById('itemModalTitle').textContent = item ? 'Editar experiencia' : 'Añadir experiencia';
  document.getElementById('itemId').value = item ? item.id : '';
  document.getElementById('itemEmpresa').value = item ? item.empresa : '';
  document.getElementById('itemPuesto').value = item ? item.puesto : '';
  document.getElementById('itemFechaInicio').value = item ? (item.fechaInicio || '') : '';
  document.getElementById('itemFechaFin').value = item ? (item.fechaFin || '') : '';
  document.getElementById('itemTipoContrato').value = item ? (item.tipoContrato || '') : (activeTipo !== 'todos' ? activeTipo : '');
  document.getElementById('itemModalidad').value = item ? (item.modalidad || 'Presencial') : 'Presencial';
  document.getElementById('itemNotas').value = item ? (item.notas || '') : '';
  document.getElementById('itemDeleteBtn').style.display = item ? 'inline-flex' : 'none';
  gvOpenModal('itemOverlay');
}

function gvSaveItem() {
  const id = document.getElementById('itemId').value;
  const empresa = document.getElementById('itemEmpresa').value.trim();
  const fechaInicio = document.getElementById('itemFechaInicio').value;
  if (!empresa) { gvToast('Escribe el nombre de la empresa'); return; }
  if (!fechaInicio) { gvToast('Indica la fecha de inicio'); return; }
  const obj = {
    id: id || GV_STORE.uid(),
    empresa,
    puesto: document.getElementById('itemPuesto').value.trim(),
    fechaInicio,
    fechaFin: document.getElementById('itemFechaFin').value,
    tipoContrato: document.getElementById('itemTipoContrato').value.trim() || 'Otro',
    modalidad: document.getElementById('itemModalidad').value,
    notas: document.getElementById('itemNotas').value.trim()
  };
  if (id) { const idx = ITEMS.findIndex(i => i.id === id); if (idx > -1) ITEMS[idx] = obj; }
  else ITEMS.push(obj);
  gvCloseModal('itemOverlay');
  gvSaveState();
}

function gvDeleteItem() {
  const id = document.getElementById('itemId').value;
  if (!id || !confirm('¿Eliminar esta experiencia?')) return;
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

function gvParseWorkbook(wb) {
  const sheetName = wb.SheetNames.find(n => /laboral/i.test(n)) || wb.SheetNames[0];
  const rows = GV_IO.sheetToRows(wb.Sheets[sheetName]);
  const pick = (row, keys) => { for (const k of keys) { if (row[k] !== undefined && row[k] !== '') return row[k]; } return ''; };

  return rows.map(row => ({
    id: GV_STORE.uid(),
    empresa: String(pick(row, ['Empresa'])).trim(),
    puesto: String(pick(row, ['Puesto'])).trim(),
    fechaInicio: GV_IO.excelDateToISO(pick(row, ['Fecha inicio', 'Fecha Inicio'])),
    fechaFin: GV_IO.excelDateToISO(pick(row, ['Fecha final', 'Fecha Final', 'Fecha fin'])),
    tipoContrato: String(pick(row, ['Tipo de contrato', 'Tipo contrato']) || 'Otro').trim(),
    modalidad: String(pick(row, ['Modalidad']) || 'Presencial').trim(),
    notas: String(pick(row, ['Notas'])).trim()
  })).filter(i => i.empresa);
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
      gvToast(`Importadas ${newItems.length} experiencia(s) ✓`);
    }
  }).catch(err => { console.error(err); gvToast('No se pudo leer el archivo'); });
}

function gvResolveImport(mode) {
  if (!pendingImportData) return;
  if (mode === 'reemplazar') {
    ITEMS = pendingImportData;
  } else {
    const sig = i => [i.empresa, i.puesto, i.fechaInicio].join('|').toLowerCase();
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
  if (format === 'csv') GV_IO.downloadCSV(gvRowsOrHeader(rows, headers), 'vida-laboral.csv');
  else GV_IO.downloadWorkbook([{ name: 'Vida Laboral', rows: gvRowsOrHeader(rows, headers) }], 'vida-laboral.xlsx');
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
  document.getElementById('tipoTabs').addEventListener('click', gvOnTabsClick);
  document.getElementById('itemsBody').addEventListener('click', gvOnTableClick);
  document.getElementById('sideCol').addEventListener('click', gvOnSideColClick);
  document.querySelector('#itemsTable thead').addEventListener('click', gvOnHeaderClick);

  if (ITEMS.length > 0) gvShowApp();
  else document.getElementById('emptyState').style.display = 'block';
  gvTryReconnect();
}
document.addEventListener('DOMContentLoaded', gvInit);
