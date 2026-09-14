// ---------- Estado ----------
let GASTOS = GV_STORE.get('gv_garaje_gastos', []);
let VEHICULOS = GV_STORE.get('gv_garaje_vehiculos', []);
let activeVehicle = 'todos';
let pendingImportData = null;
let gvChartInstance = null;
let toastTimer = null;
let gvExpanded = new Set();
let gvSort = { field: 'fecha', dir: 'desc' };
let gvChartMode = 'mes'; // 'mes' | 'año'
let gvChartOffset = 0;
const gvPalette = ['#00d084', '#4f8cff', '#f5a623', '#ef5b5b', '#c084fc', '#22d3ee', '#facc15', '#fb7185'];
let gvFileHandle = null;   // FileSystemFileHandle del archivo .xlsx activo (null = sin archivo / navegador sin soporte)
let gvFileName = null;     // nombre a mostrar en la UI
let gvDirty = false;       // hay cambios sin guardar en el archivo activo

// ---------- Helpers ----------
function gvHtmlEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
const gvAttrEsc = gvHtmlEsc;

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
function gvDaysDiff(fromISO, toISO) {
  return Math.round((new Date(toISO) - new Date(fromISO)) / 86400000);
}
function gvRowsOrHeader(rows, headers) {
  if (rows.length) return rows;
  const o = {}; headers.forEach(h => o[h] = ''); return [o];
}
function gvToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 1600);
}
function gvOpenModal(id) { document.getElementById(id).classList.add('open'); }
function gvCloseModal(id) { document.getElementById(id).classList.remove('open'); }

function gvAllVehicleNames() {
  const set = new Set(VEHICULOS.map(v => v.nombre));
  GASTOS.forEach(g => { if (g.vehiculo) set.add(g.vehiculo); });
  return Array.from(set).filter(Boolean);
}

function gvRound2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function gvVehColor(name) {
  const v = VEHICULOS.find(x => x.nombre === name);
  return (v && v.color) ? v.color : '#00d084';
}

// Da de alta una ficha mínima (con color asignado) a cualquier vehículo que
// solo exista como texto en los gastos, y asigna color a los que no lo tengan.
function gvEnsureVehicleColors() {
  const names = gvAllVehicleNames();
  let changed = false;
  names.forEach((n, i) => {
    let v = VEHICULOS.find(x => x.nombre === n);
    if (!v) { v = { nombre: n }; VEHICULOS.push(v); changed = true; }
    if (!v.color) { v.color = gvPalette[i % gvPalette.length]; changed = true; }
  });
  if (changed) GV_STORE.set('gv_garaje_vehiculos', VEHICULOS);
}

// ---------- Persistencia ----------
function gvSaveState() {
  GV_STORE.set('gv_garaje_gastos', GASTOS);
  GV_STORE.set('gv_garaje_vehiculos', VEHICULOS);
  gvDirty = true;
  gvRenderFileStatus();
  gvToast('Guardado en el navegador ✓');
  gvRenderAll();
}

const GV_OWN_SHEETS = ['Garaje - Gastos', 'Garaje - Vehículos'];

// Construye el contenido a escribir fusionando con lo que ya haya en el archivo destino
// (handle puede ser null: navegador sin soporte, o archivo nuevo). Así nunca se pisan
// hojas de otras apps (Inventario, Deudas...) si comparten el mismo Excel.
async function gvBuildMergedBuffer(handle) {
  const existingWb = await GV_IO.readWorkbookFromHandle(handle);
  const { gastosHeaders, gastosRows, vehHeaders, vehRows } = gvBuildSheetsRows();
  const wb = GV_IO.mergeAndBuildWorkbook(existingWb, GV_OWN_SHEETS, [
    { name: 'Garaje - Gastos', rows: gvRowsOrHeader(gastosRows, gastosHeaders) },
    { name: 'Garaje - Vehículos', rows: gvRowsOrHeader(vehRows, vehHeaders) }
  ]);
  return GV_IO.workbookToArrayBuffer(wb);
}

const GV_XLSX_TYPES = [{ description: 'Libro de Excel', accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] } }];
const GV_XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
let gvReconnectHandle = null; // handle recordado de otra app, pendiente de un clic para reconectar

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
  el.style.cursor = '';
  el.onclick = null;
  if (!gvFileName) {
    el.textContent = '📄 sin archivo abierto';
    el.className = 'file-status';
    return;
  }
  el.textContent = gvDirty ? `📄 ${gvFileName} · sin guardar` : `📄 ${gvFileName} · guardado`;
  el.className = 'file-status' + (gvDirty ? ' dirty' : ' saved');
}

async function gvAdoptHandle(handle) {
  try {
    const file = await handle.getFile();
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array', cellDates: true });
    const { gastos, vehiculos } = gvParseWorkbook(wb);
    GASTOS = gastos;
    VEHICULOS = vehiculos;
    gvFileHandle = handle;
    gvFileName = handle.name;
    gvDirty = false;
    GV_STORE.set('gv_garaje_gastos', GASTOS);
    GV_STORE.set('gv_garaje_vehiculos', VEHICULOS);
    gvShowApp();
    gvRenderFileStatus();
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

// Al cargar la página: si otra app (Inventario...) dejó un archivo vinculado, lo intenta recuperar.
// Si el navegador ya concedió permiso en esta sesión, entra directo; si no, deja un botón para un clic.
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
    const { gastos, vehiculos } = gvParseWorkbook(wb);
    GASTOS = gastos;
    VEHICULOS = vehiculos;
    gvFileHandle = res.handle;
    gvFileName = res.name;
    gvDirty = false;
    gvReconnectHandle = null;
    if (res.handle) GV_FILE.rememberHandle(res.handle);
    GV_STORE.set('gv_garaje_gastos', GASTOS);
    GV_STORE.set('gv_garaje_vehiculos', VEHICULOS);
    gvShowApp();
    gvRenderFileStatus();
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
      gvDirty = false;
      gvRenderFileStatus();
      gvToast('Guardado ✓');
    } catch (err) {
      console.error(err);
      gvToast('No se pudo guardar. Prueba "Guardar como"');
    }
  } else {
    await gvSaveFileAs();
  }
}

async function gvSaveFileAs() {
  try {
    const suggested = gvFileName || 'garaje.xlsx';
    const res = await GV_FILE.saveAs(handle => gvBuildMergedBuffer(handle), suggested, { types: GV_XLSX_TYPES, mime: GV_XLSX_MIME });
    gvFileHandle = res.handle;
    gvFileName = res.name;
    gvDirty = false;
    if (res.handle) GV_FILE.rememberHandle(res.handle);
    gvRenderFileStatus();
    gvToast(GV_FILE.supported ? `Guardado como ${res.name} ✓` : 'Archivo descargado ✓');
  } catch (err) {
    if (err && err.name !== 'AbortError') { console.error(err); gvToast('No se pudo guardar el archivo'); }
  }
}

async function gvForgetFile() {
  await GV_FILE.forgetHandle();
  gvFileHandle = null;
  gvFileName = null;
  gvReconnectHandle = null;
  gvDirty = false;
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
  gvEnsureVehicleColors();
  gvRenderTabs();
  const filtered = activeVehicle === 'todos' ? GASTOS.slice() : GASTOS.filter(g => g.vehiculo === activeVehicle);
  gvRenderStats(filtered);
  gvRenderSideCol(filtered);
  gvRenderTable();
}

function gvRenderTabs() {
  const names = gvAllVehicleNames();
  if (activeVehicle !== 'todos' && !names.includes(activeVehicle)) activeVehicle = 'todos';
  let html = `<button class="tab ${activeVehicle === 'todos' ? 'active' : ''}" data-vehicle="todos">Todos</button>`;
  names.forEach(n => {
    const active = activeVehicle === n;
    const color = gvVehColor(n);
    const dot = active ? '' : `<span class="veh-dot" style="background:${color}"></span>`;
    html += `<button class="tab ${active ? 'active' : ''}" data-vehicle="${gvAttrEsc(n)}" style="--accent:${color}">${dot}${gvHtmlEsc(n)}</button>`;
  });
  html += `<button class="tab add" data-action="add-vehicle">+ Vehículo</button>`;
  document.getElementById('vehicleTabs').innerHTML = html;
}

function gvComputeStats(filtered) {
  const total = gvRound2(filtered.reduce((s, g) => s + (Number(g.coste) || 0), 0));
  const year = new Date().getFullYear();
  const totalYear = gvRound2(filtered
    .filter(g => g.fechaInicio && g.fechaInicio.slice(0, 4) === String(year))
    .reduce((s, g) => s + (Number(g.coste) || 0), 0));
  const today = new Date().toISOString().slice(0, 10);
  const withVenc = filtered.filter(g => g.fechaFinal).sort((a, b) => a.fechaFinal.localeCompare(b.fechaFinal));
  const future = withVenc.filter(g => g.fechaFinal >= today);
  const venc = future.length ? future[0] : (withVenc.length ? withVenc[withVenc.length - 1] : null);
  return { total, totalYear, count: filtered.length, venc };
}

function gvRenderStats(filtered) {
  const s = gvComputeStats(filtered);
  const year = new Date().getFullYear();
  let vencHtml = '—', vencClass = '';
  if (s.venc) {
    const today = new Date().toISOString().slice(0, 10);
    const days = gvDaysDiff(today, s.venc.fechaFinal);
    if (days < 0) { vencClass = 'bad'; vencHtml = 'Caducado'; }
    else if (days <= 30) { vencClass = 'warn'; vencHtml = `en ${days} días`; }
    else { vencClass = 'good'; vencHtml = gvFormatDate(s.venc.fechaFinal); }
  }
  document.getElementById('statsRow').innerHTML = `
    <div class="stat-card"><div class="label">Gastado en total</div><div class="value">${gvFormatMoney(s.total)}</div></div>
    <div class="stat-card"><div class="label">Gastado en ${year}</div><div class="value">${gvFormatMoney(s.totalYear)}</div></div>
    <div class="stat-card"><div class="label">Gastos registrados</div><div class="value">${s.count}</div></div>
    <div class="stat-card"><div class="label">Próximo vencimiento</div><div class="value ${vencClass}">${vencHtml}</div></div>
  `;
}

function gvMonthLabel(key) {
  const [y, m] = key.split('-');
  const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  return `${meses[parseInt(m, 10) - 1]} ${y.slice(2)}`;
}

function gvGroupedTotals(filtered, mode) {
  const map = {};
  filtered.forEach(g => {
    if (!g.fechaInicio) return;
    const key = mode === 'año' ? g.fechaInicio.slice(0, 4) : g.fechaInicio.slice(0, 7);
    map[key] = gvRound2((map[key] || 0) + (Number(g.coste) || 0));
  });
  return map;
}

// Ventana deslizante sobre las claves ordenadas (meses o años), navegable con flechas.
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
    clampedOffset,
    canPrev: start > 0,
    canNext: clampedOffset > 0,
    rangeLabel: windowKeys.length ? `${windowKeys[0]} → ${windowKeys[windowKeys.length - 1]}` : 'sin datos'
  };
}

function gvChartCardHtml() {
  return `
    <div class="card">
      <div class="chart-head">
        <h3 style="margin:0;">Gasto</h3>
        <div class="chart-toggle">
          <button id="chartModeMes" class="${gvChartMode === 'mes' ? 'active' : ''}">Mes</button>
          <button id="chartModeAnio" class="${gvChartMode === 'año' ? 'active' : ''}">Año</button>
        </div>
      </div>
      <div class="chart-wrap"><canvas id="gastoChart"></canvas></div>
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

// Re-renderiza solo el gráfico y sus controles (sin reconstruir toda la columna lateral).
function gvRenderSideColChartOnly(filtered) {
  document.getElementById('chartModeMes').classList.toggle('active', gvChartMode === 'mes');
  document.getElementById('chartModeAnio').classList.toggle('active', gvChartMode === 'año');
  gvRenderChart(filtered);
}

function gvRenderVehTotalsList(names) {
  const totals = names
    .map(n => ({ n, total: gvRound2(GASTOS.filter(g => g.vehiculo === n).reduce((s, g) => s + (Number(g.coste) || 0), 0)) }))
    .sort((a, b) => b.total - a.total);
  if (!totals.length) {
    return '<p style="color:var(--text-dim); font-size:.85rem; margin:0;">Añade un vehículo con el botón "+ Vehículo" para empezar.</p>';
  }
  return `<div id="vehTotalsList">` + totals.map(t => {
    const expanded = gvExpanded.has(t.n);
    const veh = VEHICULOS.find(v => v.nombre === t.n) || { nombre: t.n };
    return `
      <div class="veh-total-row ${expanded ? 'expanded' : ''}" data-name="${gvAttrEsc(t.n)}">
        <div class="info-row">
          <span class="k"><span class="arrow">▸</span><span class="veh-dot" style="background:${gvVehColor(t.n)}"></span>${gvHtmlEsc(t.n)}</span>
          <span class="v">${gvFormatMoney(t.total)}</span>
        </div>
        ${expanded ? `
          <div class="veh-mini-ficha">
            <div class="info-row"><span class="k">Marca / Modelo</span><span class="v">${gvHtmlEsc(veh.marcaModelo || '—')}</span></div>
            <div class="info-row"><span class="k">Matrícula</span><span class="v">${gvHtmlEsc(veh.matricula || '—')}</span></div>
            <div class="info-row"><span class="k">Neumáticos</span><span class="v">${gvHtmlEsc(veh.neumaticos || '—')}</span></div>
            <div class="info-row"><span class="k">Batería</span><span class="v">${gvHtmlEsc(veh.bateria || '—')}</span></div>
            <div class="info-row"><span class="k">Aceite</span><span class="v">${gvHtmlEsc(veh.aceite || '—')}</span></div>
            <div class="info-row"><span class="k">De alta desde</span><span class="v">${gvFormatDate(veh.fechaAlta)}</span></div>
            <div class="card-actions"><button class="btn small ghost" data-action="edit-veh">✎ Editar ficha</button></div>
          </div>` : ''}
      </div>`;
  }).join('') + `</div>`;
}

function gvOnSideColClick(e) {
  const editBtn = e.target.closest('[data-action="edit-veh"]');
  const row = e.target.closest('.veh-total-row');
  if (editBtn && row) {
    e.stopPropagation();
    const veh = VEHICULOS.find(v => v.nombre === row.dataset.name);
    gvOpenVehiculoModal(veh);
    return;
  }
  if (row) {
    const name = row.dataset.name;
    if (gvExpanded.has(name)) gvExpanded.delete(name); else gvExpanded.add(name);
    gvRenderAll();
  }
}

function gvRenderSideCol(filtered) {
  const container = document.getElementById('sideCol');
  if (activeVehicle === 'todos') {
    container.innerHTML = `
      <div class="card" style="margin-bottom:1rem;">
        <h3>Por vehículo</h3>
        ${gvRenderVehTotalsList(gvAllVehicleNames())}
      </div>
      ${gvChartCardHtml()}`;
  } else {
    const veh = VEHICULOS.find(v => v.nombre === activeVehicle) || { nombre: activeVehicle };
    container.innerHTML = `
      <div class="card" style="margin-bottom:1rem; border-left: 3px solid ${gvVehColor(veh.nombre)};">
        <h3>${gvHtmlEsc(veh.nombre)}</h3>
        <div class="info-row"><span class="k">Marca / Modelo</span><span class="v">${gvHtmlEsc(veh.marcaModelo || '—')}</span></div>
        <div class="info-row"><span class="k">Matrícula</span><span class="v">${gvHtmlEsc(veh.matricula || '—')}</span></div>
        <div class="info-row"><span class="k">Neumáticos</span><span class="v">${gvHtmlEsc(veh.neumaticos || '—')}</span></div>
        <div class="info-row"><span class="k">Batería</span><span class="v">${gvHtmlEsc(veh.bateria || '—')}</span></div>
        <div class="info-row"><span class="k">Aceite</span><span class="v">${gvHtmlEsc(veh.aceite || '—')}</span></div>
        <div class="info-row"><span class="k">De alta desde</span><span class="v">${gvFormatDate(veh.fechaAlta)}</span></div>
        ${veh.notas ? `<div class="info-row"><span class="k">Notas</span><span class="v">${gvHtmlEsc(veh.notas)}</span></div>` : ''}
        <div class="card-actions"><button class="btn small ghost" id="vehEditBtn">✎ Editar ficha</button></div>
      </div>
      ${gvChartCardHtml()}`;
    document.getElementById('vehEditBtn').addEventListener('click', () => gvOpenVehiculoModal(veh));
  }
  gvBindChartControls(filtered);
  gvRenderChart(filtered);
}

function gvRenderChart(filtered) {
  const ctx = document.getElementById('gastoChart');
  if (!ctx) return;
  const map = gvGroupedTotals(filtered, gvChartMode);
  const win = gvChartWindow(map, gvChartMode, gvChartOffset);
  gvChartOffset = win.clampedOffset;

  document.getElementById('chartPrev').disabled = !win.canPrev;
  document.getElementById('chartNext').disabled = !win.canNext;
  document.getElementById('chartRangeLabel').textContent = win.labels.length ? `${win.labels[0]} – ${win.labels[win.labels.length - 1]}` : 'sin datos';

  const barColor = activeVehicle === 'todos' ? '#00d084' : gvVehColor(activeVehicle);
  if (gvChartInstance) gvChartInstance.destroy();
  gvChartInstance = new Chart(ctx, {
    type: 'bar',
    data: { labels: win.labels, datasets: [{ label: '€', data: win.data, backgroundColor: barColor, borderRadius: 4, maxBarThickness: 28 }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: '#92a1bd', font: { family: 'JetBrains Mono', size: 10 } }, grid: { display: false } },
        y: { ticks: { color: '#92a1bd', font: { size: 10 } }, grid: { color: '#263450' } }
      }
    }
  });
}

function gvUpdateSortHeaders() {
  ['fecha', 'coste'].forEach(f => {
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
  let rows = activeVehicle === 'todos' ? GASTOS.slice() : GASTOS.filter(g => g.vehiculo === activeVehicle);
  if (q) {
    rows = rows.filter(g =>
      (g.descripcion || '').toLowerCase().includes(q) ||
      (g.proveedor || '').toLowerCase().includes(q) ||
      (g.notas || '').toLowerCase().includes(q)
    );
  }
  rows.sort((a, b) => {
    let av, bv;
    if (gvSort.field === 'coste') { av = Number(a.coste) || 0; bv = Number(b.coste) || 0; }
    else { av = a.fechaInicio || ''; bv = b.fechaInicio || ''; }
    if (av < bv) return gvSort.dir === 'asc' ? -1 : 1;
    if (av > bv) return gvSort.dir === 'asc' ? 1 : -1;
    return 0;
  });
  gvUpdateSortHeaders();
  const today = new Date().toISOString().slice(0, 10);

  document.getElementById('gastosBody').innerHTML = rows.length ? rows.map(g => {
    let vencHtml = '—';
    if (g.fechaFinal) {
      const days = gvDaysDiff(today, g.fechaFinal);
      if (days < 0) vencHtml = `<span class="badge bad">Caducado</span>`;
      else if (days <= 30) vencHtml = `<span class="badge warn">${gvFormatDate(g.fechaFinal)}</span>`;
      else vencHtml = `<span class="badge ok">${gvFormatDate(g.fechaFinal)}</span>`;
    }
    return `<tr data-id="${g.id}">
      <td>${gvFormatDate(g.fechaInicio)}</td>
      <td>${gvHtmlEsc(g.vehiculo || '—')}</td>
      <td><span class="badge cat">${gvHtmlEsc(g.categoria || 'Otro')}</span></td>
      <td>${gvHtmlEsc(g.descripcion || '')}${g.kilometraje ? `<div style="color:var(--text-dim); font-size:.76rem; margin-top:.2rem;">${gvHtmlEsc(g.kilometraje)}</div>` : ''}</td>
      <td class="num">${gvFormatMoney(g.coste)}</td>
      <td>${vencHtml}</td>
      <td class="row-actions"><button data-action="edit" title="Editar">✎</button><button data-action="delete" title="Eliminar">🗑</button></td>
    </tr>`;
  }).join('') : `<tr><td colspan="7" style="text-align:center; color:var(--text-dim); padding:2rem 0;">No hay gastos que coincidan.</td></tr>`;
}

// ---------- Interacciones (delegación de eventos) ----------
function gvOnTabsClick(e) {
  const addBtn = e.target.closest('[data-action="add-vehicle"]');
  if (addBtn) { gvOpenVehiculoModal(); return; }
  const tab = e.target.closest('.tab[data-vehicle]');
  if (tab) { activeVehicle = tab.dataset.vehicle; gvChartOffset = 0; gvRenderAll(); }
}

function gvOnTableClick(e) {
  const tr = e.target.closest('tr[data-id]');
  if (!tr) return;
  const id = tr.dataset.id;
  if (e.target.closest('[data-action="edit"]')) {
    const g = GASTOS.find(x => x.id === id);
    if (g) gvOpenGastoModal(g);
  } else if (e.target.closest('[data-action="delete"]')) {
    if (confirm('¿Eliminar este gasto?')) {
      GASTOS = GASTOS.filter(x => x.id !== id);
      gvSaveState();
    }
  }
}

// ---------- Modal: gasto ----------
function gvOpenGastoModal(gasto) {
  const names = gvAllVehicleNames();
  const sel = document.getElementById('gastoVehiculo');
  sel.innerHTML = names.length
    ? names.map(n => `<option value="${gvAttrEsc(n)}">${gvHtmlEsc(n)}</option>`).join('')
    : '<option value="">(añade un vehículo primero)</option>';

  document.getElementById('gastoModalTitle').textContent = gasto ? 'Editar gasto' : 'Añadir gasto';
  document.getElementById('gastoId').value = gasto ? gasto.id : '';
  document.getElementById('gastoVehiculo').value = gasto ? gasto.vehiculo : (activeVehicle !== 'todos' ? activeVehicle : (names[0] || ''));
  document.getElementById('gastoCategoria').value = gasto ? gasto.categoria : 'Mantenimiento';
  document.getElementById('gastoCoste').value = gasto ? (gasto.coste ?? '') : '';
  document.getElementById('gastoDescripcion').value = gasto ? gasto.descripcion : '';
  document.getElementById('gastoFechaInicio').value = gasto ? (gasto.fechaInicio || '') : new Date().toISOString().slice(0, 10);
  document.getElementById('gastoFechaFinal').value = gasto ? (gasto.fechaFinal || '') : '';
  document.getElementById('gastoKm').value = gasto ? (gasto.kilometraje || '') : '';
  document.getElementById('gastoProveedor').value = gasto ? (gasto.proveedor || '') : '';
  document.getElementById('gastoNotas').value = gasto ? (gasto.notas || '') : '';
  document.getElementById('gastoDeleteBtn').style.display = gasto ? 'inline-flex' : 'none';
  gvOpenModal('gastoOverlay');
}

function gvSaveGasto() {
  const id = document.getElementById('gastoId').value;
  const vehiculo = document.getElementById('gastoVehiculo').value.trim();
  const descripcion = document.getElementById('gastoDescripcion').value.trim();
  if (!vehiculo) { gvToast('Añade un vehículo primero'); return; }
  if (!descripcion) { gvToast('Escribe una descripción'); return; }
  const obj = {
    id: id || GV_STORE.uid(),
    vehiculo,
    categoria: document.getElementById('gastoCategoria').value,
    descripcion,
    coste: GV_IO.toNumber(document.getElementById('gastoCoste').value),
    fechaInicio: document.getElementById('gastoFechaInicio').value,
    fechaFinal: document.getElementById('gastoFechaFinal').value,
    kilometraje: document.getElementById('gastoKm').value.trim(),
    proveedor: document.getElementById('gastoProveedor').value.trim(),
    notas: document.getElementById('gastoNotas').value.trim()
  };
  if (id) {
    const idx = GASTOS.findIndex(g => g.id === id);
    if (idx > -1) GASTOS[idx] = obj;
  } else {
    GASTOS.push(obj);
  }
  gvCloseModal('gastoOverlay');
  gvSaveState();
}

function gvDeleteGasto() {
  const id = document.getElementById('gastoId').value;
  if (!id || !confirm('¿Eliminar este gasto?')) return;
  GASTOS = GASTOS.filter(g => g.id !== id);
  gvCloseModal('gastoOverlay');
  gvSaveState();
}

// ---------- Modal: vehículo ----------
function gvOpenVehiculoModal(veh) {
  document.getElementById('vehiculoModalTitle').textContent = veh ? 'Editar vehículo' : 'Nuevo vehículo';
  document.getElementById('vehiculoOriginalNombre').value = veh ? veh.nombre : '';
  document.getElementById('vehNombre').value = veh ? veh.nombre : '';
  document.getElementById('vehMarcaModelo').value = veh ? (veh.marcaModelo || '') : '';
  document.getElementById('vehMatricula').value = veh ? (veh.matricula || '') : '';
  document.getElementById('vehFechaAlta').value = veh ? (veh.fechaAlta || '') : '';
  document.getElementById('vehNeumaticos').value = veh ? (veh.neumaticos || '') : '';
  document.getElementById('vehBateria').value = veh ? (veh.bateria || '') : '';
  document.getElementById('vehAceite').value = veh ? (veh.aceite || '') : '';
  document.getElementById('vehColor').value = (veh && veh.color) ? veh.color : gvPalette[VEHICULOS.length % gvPalette.length];
  document.getElementById('vehNotas').value = veh ? (veh.notas || '') : '';
  document.getElementById('vehDeleteBtn').style.display = veh ? 'inline-flex' : 'none';
  gvOpenModal('vehiculoOverlay');
}

function gvSaveVehiculo() {
  const original = document.getElementById('vehiculoOriginalNombre').value;
  const nombre = document.getElementById('vehNombre').value.trim();
  if (!nombre) { gvToast('Ponle un nombre al vehículo'); return; }
  const obj = {
    nombre,
    marcaModelo: document.getElementById('vehMarcaModelo').value.trim(),
    matricula: document.getElementById('vehMatricula').value.trim(),
    fechaAlta: document.getElementById('vehFechaAlta').value,
    neumaticos: document.getElementById('vehNeumaticos').value.trim(),
    bateria: document.getElementById('vehBateria').value.trim(),
    aceite: document.getElementById('vehAceite').value.trim(),
    color: document.getElementById('vehColor').value,
    notas: document.getElementById('vehNotas').value.trim()
  };
  if (original) {
    const idx = VEHICULOS.findIndex(v => v.nombre === original);
    if (idx > -1) VEHICULOS[idx] = obj; else VEHICULOS.push(obj);
    if (original !== nombre) {
      GASTOS.forEach(g => { if (g.vehiculo === original) g.vehiculo = nombre; });
      if (activeVehicle === original) activeVehicle = nombre;
    }
  } else {
    if (VEHICULOS.some(v => v.nombre === nombre)) { gvToast('Ya existe un vehículo con ese nombre'); return; }
    VEHICULOS.push(obj);
    activeVehicle = nombre;
  }
  gvCloseModal('vehiculoOverlay');
  gvSaveState();
}

function gvDeleteVehiculo() {
  const original = document.getElementById('vehiculoOriginalNombre').value;
  if (!original) return;
  const gastosCount = GASTOS.filter(g => g.vehiculo === original).length;
  const msg = gastosCount > 0
    ? `Se eliminará la ficha de "${original}". Sus ${gastosCount} gasto(s) seguirán registrados pero sin ficha asociada.`
    : `¿Eliminar el vehículo "${original}"?`;
  if (!confirm(msg)) return;
  VEHICULOS = VEHICULOS.filter(v => v.nombre !== original);
  if (activeVehicle === original) activeVehicle = 'todos';
  gvCloseModal('vehiculoOverlay');
  gvSaveState();
}

// ---------- Importar ----------
function gvSetupDropzone() {
  const dz = document.getElementById('emptyState');
  ['dragenter', 'dragover'].forEach(evt => dz.addEventListener(evt, e => { e.preventDefault(); dz.classList.add('drag'); }));
  ['dragleave', 'drop'].forEach(evt => dz.addEventListener(evt, e => { e.preventDefault(); dz.classList.remove('drag'); }));
  dz.addEventListener('drop', e => { const f = e.dataTransfer.files[0]; if (f) gvProcessFile(f); });
}

// Convierte un Workbook de SheetJS en { gastos:[...], vehiculos:[...] } normalizados.
function gvParseWorkbook(wb) {
  const gastosSheetName = wb.SheetNames.find(n => /gasto/i.test(n)) || wb.SheetNames[0];
  const vehSheetName = wb.SheetNames.find(n => n !== gastosSheetName && /veh[ií]cul/i.test(n));
  const gastosRows = GV_IO.sheetToRows(wb.Sheets[gastosSheetName]);
  const vehRows = vehSheetName ? GV_IO.sheetToRows(wb.Sheets[vehSheetName]) : [];

  const pick = (row, keys) => {
    for (const k of keys) { if (row[k] !== undefined && row[k] !== '') return row[k]; }
    return '';
  };

  const gastos = gastosRows.map(row => ({
    id: GV_STORE.uid(),
    vehiculo: String(pick(row, ['Vehículo', 'Vehiculo', 'vehiculo'])).trim(),
    categoria: String(pick(row, ['Categoría', 'Categoria']) || 'Otro').trim(),
    descripcion: String(pick(row, ['Descripción', 'Descripcion'])).trim(),
    coste: GV_IO.toNumber(pick(row, ['Coste (€)', 'Coste', 'Costo', 'Precio (€)', 'Precio'])),
    fechaInicio: GV_IO.excelDateToISO(pick(row, ['Fecha inicio', 'Fecha compra', 'Fecha'])),
    fechaFinal: GV_IO.excelDateToISO(pick(row, ['Fecha final', 'Vence'])),
    kilometraje: String(pick(row, ['Kilometraje', 'Km'])).trim(),
    proveedor: String(pick(row, ['Proveedor / Link', 'Proveedor', 'Productos', 'Vendedor / Tienda'])).trim(),
    notas: String(pick(row, ['Notas'])).trim()
  })).filter(g => g.vehiculo || g.descripcion);

  const vehiculos = vehRows.map(row => ({
    nombre: String(pick(row, ['Vehículo', 'Vehiculo', 'Nombre'])).trim(),
    marcaModelo: String(pick(row, ['Marca / Modelo', 'Marca/Modelo', 'Marca'])).trim(),
    matricula: String(pick(row, ['Matrícula', 'Matricula'])).trim(),
    fechaAlta: GV_IO.excelDateToISO(pick(row, ['Fecha alta', 'Fecha compra'])),
    neumaticos: String(pick(row, ['Neumáticos', 'Neumaticos'])).trim(),
    bateria: String(pick(row, ['Batería', 'Bateria'])).trim(),
    aceite: String(pick(row, ['Aceite'])).trim(),
    color: String(pick(row, ['Color'])).trim(),
    notas: String(pick(row, ['Notas'])).trim()
  })).filter(v => v.nombre);

  return { gastos, vehiculos };
}

// Construye las filas (con cabeceras) listas para exportar/guardar, a partir del estado actual.
function gvBuildSheetsRows() {
  const gastosHeaders = ['Vehículo', 'Categoría', 'Descripción', 'Coste (€)', 'Fecha inicio', 'Fecha final', 'Kilometraje', 'Proveedor / Link', 'Notas'];
  const gastosRows = GASTOS.map(g => ({
    'Vehículo': g.vehiculo, 'Categoría': g.categoria, 'Descripción': g.descripcion,
    'Coste (€)': g.coste, 'Fecha inicio': g.fechaInicio, 'Fecha final': g.fechaFinal,
    'Kilometraje': g.kilometraje, 'Proveedor / Link': g.proveedor, 'Notas': g.notas
  }));
  const vehHeaders = ['Vehículo', 'Marca / Modelo', 'Matrícula', 'Neumáticos', 'Batería', 'Aceite', 'Fecha alta', 'Color', 'Notas'];
  const vehRows = VEHICULOS.map(v => ({
    'Vehículo': v.nombre, 'Marca / Modelo': v.marcaModelo, 'Matrícula': v.matricula,
    'Neumáticos': v.neumaticos, 'Batería': v.bateria, 'Aceite': v.aceite, 'Fecha alta': v.fechaAlta,
    'Color': v.color, 'Notas': v.notas
  }));
  return { gastosHeaders, gastosRows, vehHeaders, vehRows };
}

function gvProcessFile(file) {
  GV_IO.readWorkbookFromFile(file).then(wb => {
    const { gastos: newGastos, vehiculos: newVehiculos } = gvParseWorkbook(wb);
    if (GASTOS.length > 0 || VEHICULOS.length > 0) {
      pendingImportData = { gastos: newGastos, vehiculos: newVehiculos };
      gvOpenModal('importOverlay');
    } else {
      GASTOS = newGastos;
      VEHICULOS = newVehiculos;
      gvShowApp();
      gvSaveState();
      gvToast(`Importados ${newGastos.length} gasto(s) ✓`);
    }
  }).catch(err => { console.error(err); gvToast('No se pudo leer el archivo'); });
}

function gvResolveImport(mode) {
  if (!pendingImportData) return;
  if (mode === 'reemplazar') {
    GASTOS = pendingImportData.gastos;
    VEHICULOS = pendingImportData.vehiculos;
  } else {
    const sig = g => [g.vehiculo, g.descripcion, g.fechaInicio, g.coste].join('|').toLowerCase();
    const existing = new Set(GASTOS.map(sig));
    pendingImportData.gastos.forEach(g => { if (!existing.has(sig(g))) GASTOS.push(g); });
    const existingNames = new Set(VEHICULOS.map(v => v.nombre));
    pendingImportData.vehiculos.forEach(v => { if (!existingNames.has(v.nombre)) VEHICULOS.push(v); });
  }
  pendingImportData = null;
  gvCloseModal('importOverlay');
  gvShowApp();
  gvSaveState();
  gvToast('Datos importados ✓');
}

// ---------- Exportar (.csv suelto, o .xlsx sin recordar el archivo) ----------
function gvExport(format) {
  if (GASTOS.length === 0 && VEHICULOS.length === 0) { gvToast('No hay datos para exportar'); return; }
  const { gastosHeaders, gastosRows, vehHeaders, vehRows } = gvBuildSheetsRows();
  if (format === 'csv') {
    GV_IO.downloadCSV(gvRowsOrHeader(gastosRows, gastosHeaders), 'garaje-gastos.csv');
  } else {
    GV_IO.downloadWorkbook([
      { name: 'Garaje - Gastos', rows: gvRowsOrHeader(gastosRows, gastosHeaders) },
      { name: 'Garaje - Vehículos', rows: gvRowsOrHeader(vehRows, vehHeaders) }
    ], 'garaje.xlsx');
  }
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
        <button id="mExportCsv">⬇ Exportar a .csv (gastos)</button>
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
    input.type = 'file';
    input.accept = '.xlsx,.xls,.csv';
    input.onchange = () => { const f = input.files[0]; if (f) gvProcessFile(f); };
    input.click();
  });
  document.getElementById('mExportCsv').addEventListener('click', () => { document.getElementById('fileMenu').classList.remove('open'); gvExport('csv'); });
  document.getElementById('mTemplate').addEventListener('click', () => { document.getElementById('fileMenu').classList.remove('open'); gvDownloadFullTemplate(); });
  document.getElementById('mForget').addEventListener('click', () => { document.getElementById('fileMenu').classList.remove('open'); gvForgetFile(); });
  gvRenderFileStatus();
}
document.addEventListener('click', () => { const m = document.getElementById('fileMenu'); if (m) m.classList.remove('open'); });

// Aviso si se intenta cerrar/recargar con cambios sin guardar en el archivo activo.
window.addEventListener('beforeunload', e => {
  if (gvDirty && gvFileName) { e.preventDefault(); e.returnValue = ''; }
});

// ---------- Init ----------
function gvInit() {
  gvRenderTopActions();
  document.getElementById('fileInput').addEventListener('change', e => { const f = e.target.files[0]; if (f) gvProcessFile(f); e.target.value = ''; });
  gvSetupDropzone();
  document.getElementById('searchInput').addEventListener('input', gvRenderTable);
  document.getElementById('vehicleTabs').addEventListener('click', gvOnTabsClick);
  document.getElementById('gastosBody').addEventListener('click', gvOnTableClick);
  document.getElementById('sideCol').addEventListener('click', gvOnSideColClick);
  document.querySelector('#gastosTable thead').addEventListener('click', gvOnHeaderClick);

  if (GASTOS.length > 0 || VEHICULOS.length > 0) {
    gvShowApp();
  } else {
    document.getElementById('emptyState').style.display = 'block';
  }
  gvTryReconnect();
}
document.addEventListener('DOMContentLoaded', gvInit);