// ---------- Estado ----------
let ITEMS = GV_STORE.get('gv_inventario_items', []);
let activeCategory = 'todos';
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
const gvPalette = ['#4f8cff', '#00d084', '#f5a623', '#ef5b5b', '#c084fc', '#22d3ee', '#facc15', '#fb7185'];
const gvCategoriasSugeridas = ['Dispositivo', 'Periférico', 'Hogar', 'Accesorio', 'Ropa', 'Herramienta', 'Otro'];
const GV_XLSX_TYPES = [{ description: 'Libro de Excel', accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] } }];
const GV_XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

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

function gvAllCategories() {
  const set = new Set(ITEMS.map(i => i.categoria).filter(Boolean));
  return Array.from(set);
}
function gvCatColor(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return gvPalette[h % gvPalette.length];
}

// Duración en meses completos entre dos fechas ISO (fin por defecto = hoy).
function gvDurationMonths(startISO, endISO) {
  if (!startISO) return null;
  const start = new Date(startISO);
  const end = endISO ? new Date(endISO) : new Date();
  let months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
  if (end.getDate() < start.getDate()) months--;
  return Math.max(0, months);
}
function gvDurationLabel(months) {
  if (months === null || months === undefined) return '—';
  const years = Math.floor(months / 12), rem = months % 12;
  if (years > 0 && rem > 0) return `${years}a ${rem}m`;
  if (years > 0) return `${years}a`;
  return `${months}m`;
}
function gvFinGarantia(item) {
  if (!item.fechaCompra || !item.garantiaMeses) return '';
  const d = new Date(item.fechaCompra);
  d.setMonth(d.getMonth() + Number(item.garantiaMeses));
  return d.toISOString().slice(0, 10);
}

// ---------- Persistencia ----------
function gvSaveState() {
  GV_STORE.set('gv_inventario_items', ITEMS);
  gvDirty = true;
  gvRenderFileStatus();
  gvToast('Guardado en el navegador ✓');
  gvRenderAll();
}

function gvBuildSheetsRows() {
  const headers = ['Categoría', 'Artículo', 'Marca / Modelo', 'Fecha compra', 'Precio (€)', 'Vendedor / Tienda', 'Garantía (meses)', 'Estado', 'Fecha baja', 'Observaciones'];
  const rows = ITEMS.map(i => ({
    'Categoría': i.categoria, 'Artículo': i.articulo, 'Marca / Modelo': i.marcaModelo,
    'Fecha compra': i.fechaCompra, 'Precio (€)': i.precio, 'Vendedor / Tienda': i.vendedor,
    'Garantía (meses)': i.garantiaMeses, 'Estado': i.estado === 'baja' ? 'De baja' : 'Activo',
    'Fecha baja': i.fechaBaja, 'Observaciones': i.observaciones
  }));
  return { headers, rows };
}

const GV_OWN_SHEETS = ['Inventario'];

async function gvBuildMergedBuffer(handle) {
  const existingWb = await GV_IO.readWorkbookFromHandle(handle);
  const { headers, rows } = gvBuildSheetsRows();
  const wb = GV_IO.mergeAndBuildWorkbook(existingWb, GV_OWN_SHEETS, [
    { name: 'Inventario', rows: gvRowsOrHeader(rows, headers) }
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
  el.style.cursor = '';
  el.onclick = null;
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
    gvFileHandle = handle;
    gvFileName = handle.name;
    gvDirty = false;
    GV_STORE.set('gv_inventario_items', ITEMS);
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
    gvFileHandle = res.handle;
    gvFileName = res.name;
    gvDirty = false;
    gvReconnectHandle = null;
    if (res.handle) GV_FILE.rememberHandle(res.handle);
    GV_STORE.set('gv_inventario_items', ITEMS);
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
      gvDirty = false; gvRenderFileStatus(); gvToast('Guardado ✓');
    } catch (err) { console.error(err); gvToast('No se pudo guardar. Prueba "Guardar como"'); }
  } else {
    await gvSaveFileAs();
  }
}

async function gvSaveFileAs() {
  try {
    const suggested = gvFileName || 'inventario.xlsx';
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
  gvRenderTabs();
  const filtered = activeCategory === 'todos' ? ITEMS.slice() : ITEMS.filter(i => i.categoria === activeCategory);
  gvRenderStats(filtered);
  gvRenderSideCol(filtered);
  gvRenderTable();
}

function gvRenderTabs() {
  const cats = gvAllCategories();
  if (activeCategory !== 'todos' && !cats.includes(activeCategory)) activeCategory = 'todos';
  let html = `<button class="tab ${activeCategory === 'todos' ? 'active' : ''}" data-cat="todos">Todos</button>`;
  cats.forEach(c => {
    const active = activeCategory === c;
    const color = gvCatColor(c);
    const dot = active ? '' : `<span class="gv-dot" style="background:${color}"></span>`;
    html += `<button class="tab ${active ? 'active' : ''}" data-cat="${gvHtmlEsc(c)}" style="--accent:${color}">${dot}${gvHtmlEsc(c)}</button>`;
  });
  document.getElementById('categoryTabs').innerHTML = html;
}

function gvComputeStats(filtered) {
  const total = gvRound2(filtered.reduce((s, i) => s + (Number(i.precio) || 0), 0));
  const activos = filtered.filter(i => i.estado !== 'baja').length;
  const bajas = filtered.filter(i => i.estado === 'baja' && i.fechaBaja);
  const duraciones = bajas.map(i => gvDurationMonths(i.fechaCompra, i.fechaBaja)).filter(m => m !== null);
  const duracionMedia = duraciones.length ? Math.round(duraciones.reduce((a, b) => a + b, 0) / duraciones.length) : null;

  const today = new Date().toISOString().slice(0, 10);
  const conGarantia = filtered
    .filter(i => i.estado !== 'baja' && gvFinGarantia(i))
    .map(i => ({ item: i, fin: gvFinGarantia(i) }))
    .sort((a, b) => a.fin.localeCompare(b.fin));
  const futuras = conGarantia.filter(g => g.fin >= today);
  const garantia = futuras.length ? futuras[0] : (conGarantia.length ? conGarantia[conGarantia.length - 1] : null);

  return { total, activos, duracionMedia, garantia };
}

function gvRenderStats(filtered) {
  const s = gvComputeStats(filtered);
  let gHtml = '—', gClass = '';
  if (s.garantia) {
    const today = new Date().toISOString().slice(0, 10);
    const days = gvDaysDiff(today, s.garantia.fin);
    if (days < 0) { gClass = 'bad'; gHtml = 'Caducada'; }
    else if (days <= 30) { gClass = 'warn'; gHtml = `en ${days} días`; }
    else { gClass = 'good'; gHtml = gvFormatDate(s.garantia.fin); }
  }
  document.getElementById('statsRow').innerHTML = `
    <div class="stat-card"><div class="label">Invertido en total</div><div class="value">${gvFormatMoney(s.total)}</div></div>
    <div class="stat-card"><div class="label">Artículos activos</div><div class="value">${s.activos}</div></div>
    <div class="stat-card"><div class="label">Duración media</div><div class="value">${gvDurationLabel(s.duracionMedia)}</div></div>
    <div class="stat-card"><div class="label">Próxima garantía</div><div class="value ${gClass}">${gHtml}</div></div>
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
    if (!i.fechaCompra) return;
    const key = mode === 'año' ? i.fechaCompra.slice(0, 4) : i.fechaCompra.slice(0, 7);
    map[key] = gvRound2((map[key] || 0) + (Number(i.precio) || 0));
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
        <h3 style="margin:0;">Inversión</h3>
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

function gvCategorySummaryHtml(items) {
  const total = gvRound2(items.reduce((s, i) => s + (Number(i.precio) || 0), 0));
  const activos = items.filter(i => i.estado !== 'baja').length;
  const bajas = items.filter(i => i.estado === 'baja');
  const duraciones = bajas.filter(i => i.fechaBaja).map(i => gvDurationMonths(i.fechaCompra, i.fechaBaja));
  const media = duraciones.length ? Math.round(duraciones.reduce((a, b) => a + b, 0) / duraciones.length) : null;
  return `
    <div class="info-row"><span class="k">Artículos</span><span class="v">${items.length}</span></div>
    <div class="info-row"><span class="k">Activos</span><span class="v">${activos}</span></div>
    <div class="info-row"><span class="k">De baja</span><span class="v">${bajas.length}</span></div>
    <div class="info-row"><span class="k">Duración media</span><span class="v">${gvDurationLabel(media)}</span></div>
    <div class="info-row"><span class="k">Invertido</span><span class="v">${gvFormatMoney(total)}</span></div>
  `;
}

function gvRenderCategoryList(cats) {
  const totals = cats
    .map(c => ({ c, items: ITEMS.filter(i => i.categoria === c) }))
    .map(x => ({ ...x, total: gvRound2(x.items.reduce((s, i) => s + (Number(i.precio) || 0), 0)) }))
    .sort((a, b) => b.total - a.total);
  if (!totals.length) return '<p style="color:var(--text-dim); font-size:.85rem; margin:0;">Añade un artículo para empezar.</p>';
  return `<div id="catTotalsList">` + totals.map(t => {
    const expanded = gvExpanded.has(t.c);
    return `
      <div class="group-row ${expanded ? 'expanded' : ''}" data-cat="${gvHtmlEsc(t.c)}">
        <div class="info-row">
          <span class="k"><span class="arrow">▸</span><span class="gv-dot" style="background:${gvCatColor(t.c)}"></span>${gvHtmlEsc(t.c)}</span>
          <span class="v">${gvFormatMoney(t.total)}</span>
        </div>
        ${expanded ? `<div class="group-detail">${gvCategorySummaryHtml(t.items)}</div>` : ''}
      </div>`;
  }).join('') + `</div>`;
}

function gvOnSideColClick(e) {
  const row = e.target.closest('.group-row');
  if (row) {
    const cat = row.dataset.cat;
    if (gvExpanded.has(cat)) gvExpanded.delete(cat); else gvExpanded.add(cat);
    gvRenderAll();
  }
}

function gvRenderSideCol(filtered) {
  const container = document.getElementById('sideCol');
  if (activeCategory === 'todos') {
    container.innerHTML = `
      <div class="card" style="margin-bottom:1rem;">
        <h3>Por categoría</h3>
        ${gvRenderCategoryList(gvAllCategories())}
      </div>
      ${gvChartCardHtml()}`;
  } else {
    container.innerHTML = `
      <div class="card" style="margin-bottom:1rem; border-left: 3px solid ${gvCatColor(activeCategory)};">
        <h3>${gvHtmlEsc(activeCategory)}</h3>
        ${gvCategorySummaryHtml(filtered)}
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
  const barColor = activeCategory === 'todos' ? '#4f8cff' : gvCatColor(activeCategory);
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
  ['fecha', 'precio'].forEach(f => {
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
  let rows = activeCategory === 'todos' ? ITEMS.slice() : ITEMS.filter(i => i.categoria === activeCategory);
  if (q) {
    rows = rows.filter(i =>
      (i.articulo || '').toLowerCase().includes(q) ||
      (i.marcaModelo || '').toLowerCase().includes(q) ||
      (i.vendedor || '').toLowerCase().includes(q)
    );
  }
  rows.sort((a, b) => {
    let av, bv;
    if (gvSort.field === 'precio') { av = Number(a.precio) || 0; bv = Number(b.precio) || 0; }
    else { av = a.fechaCompra || ''; bv = b.fechaCompra || ''; }
    if (av < bv) return gvSort.dir === 'asc' ? -1 : 1;
    if (av > bv) return gvSort.dir === 'asc' ? 1 : -1;
    return 0;
  });
  gvUpdateSortHeaders();
  const today = new Date().toISOString().slice(0, 10);

  document.getElementById('itemsBody').innerHTML = rows.length ? rows.map(i => {
    let garHtml = '—';
    const fin = gvFinGarantia(i);
    if (i.estado === 'baja') garHtml = '<span class="badge">de baja</span>';
    else if (fin) {
      const days = gvDaysDiff(today, fin);
      if (days < 0) garHtml = `<span class="badge bad">Caducada</span>`;
      else if (days <= 30) garHtml = `<span class="badge warn">${gvFormatDate(fin)}</span>`;
      else garHtml = `<span class="badge ok">${gvFormatDate(fin)}</span>`;
    }
    const months = gvDurationMonths(i.fechaCompra, i.estado === 'baja' ? i.fechaBaja : null);
    const durHtml = i.estado === 'baja'
      ? `duró ${gvDurationLabel(months)}`
      : `<span style="color:var(--text-dim);">en uso · ${gvDurationLabel(months)}</span>`;
    return `<tr data-id="${i.id}">
      <td>${gvFormatDate(i.fechaCompra)}</td>
      <td><span class="badge" style="color:${gvCatColor(i.categoria)}; border-color:${gvCatColor(i.categoria)}66;">${gvHtmlEsc(i.categoria || 'Otro')}</span></td>
      <td>${gvHtmlEsc(i.articulo || '')}${i.marcaModelo ? `<div style="color:var(--text-dim); font-size:.76rem; margin-top:.2rem;">${gvHtmlEsc(i.marcaModelo)}</div>` : ''}</td>
      <td class="num">${gvFormatMoney(i.precio)}</td>
      <td>${garHtml}</td>
      <td>${durHtml}</td>
      <td class="row-actions"><button data-action="edit" title="Editar">✎</button><button data-action="delete" title="Eliminar">🗑</button></td>
    </tr>`;
  }).join('') : `<tr><td colspan="7" style="text-align:center; color:var(--text-dim); padding:2rem 0;">No hay artículos que coincidan.</td></tr>`;
}

// ---------- Interacciones ----------
function gvOnTabsClick(e) {
  const tab = e.target.closest('.tab[data-cat]');
  if (tab) { activeCategory = tab.dataset.cat; gvChartOffset = 0; gvRenderAll(); }
}
function gvOnTableClick(e) {
  const tr = e.target.closest('tr[data-id]');
  if (!tr) return;
  const id = tr.dataset.id;
  if (e.target.closest('[data-action="edit"]')) {
    const item = ITEMS.find(x => x.id === id);
    if (item) gvOpenItemModal(item);
  } else if (e.target.closest('[data-action="delete"]')) {
    if (confirm('¿Eliminar este artículo?')) { ITEMS = ITEMS.filter(x => x.id !== id); gvSaveState(); }
  }
}

// ---------- Modal: artículo ----------
function gvToggleFechaBaja() {
  const isBaja = document.getElementById('itemEstado').value === 'baja';
  document.getElementById('fechaBajaField').style.display = isBaja ? 'block' : 'none';
}

function gvOpenItemModal(item) {
  document.getElementById('categoriaList').innerHTML = Array.from(new Set([...gvCategoriasSugeridas, ...gvAllCategories()]))
    .map(c => `<option value="${gvHtmlEsc(c)}"></option>`).join('');

  document.getElementById('itemModalTitle').textContent = item ? 'Editar artículo' : 'Añadir artículo';
  document.getElementById('itemId').value = item ? item.id : '';
  document.getElementById('itemCategoria').value = item ? item.categoria : (activeCategory !== 'todos' ? activeCategory : '');
  document.getElementById('itemEstado').value = item ? item.estado : 'activo';
  document.getElementById('itemArticulo').value = item ? item.articulo : '';
  document.getElementById('itemMarcaModelo').value = item ? (item.marcaModelo || '') : '';
  document.getElementById('itemFechaCompra').value = item ? (item.fechaCompra || '') : new Date().toISOString().slice(0, 10);
  document.getElementById('itemPrecio').value = item ? (item.precio ?? '') : '';
  document.getElementById('itemVendedor').value = item ? (item.vendedor || '') : '';
  document.getElementById('itemGarantia').value = item ? (item.garantiaMeses ?? '') : '';
  document.getElementById('itemFechaBaja').value = item ? (item.fechaBaja || '') : '';
  document.getElementById('itemObservaciones').value = item ? (item.observaciones || '') : '';
  document.getElementById('itemDeleteBtn').style.display = item ? 'inline-flex' : 'none';
  gvToggleFechaBaja();
  gvOpenModal('itemOverlay');
}

function gvSaveItem() {
  const id = document.getElementById('itemId').value;
  const categoria = document.getElementById('itemCategoria').value.trim() || 'Otro';
  const articulo = document.getElementById('itemArticulo').value.trim();
  if (!articulo) { gvToast('Escribe el nombre del artículo'); return; }
  const estado = document.getElementById('itemEstado').value;
  const obj = {
    id: id || GV_STORE.uid(),
    categoria, articulo,
    marcaModelo: document.getElementById('itemMarcaModelo').value.trim(),
    fechaCompra: document.getElementById('itemFechaCompra').value,
    precio: GV_IO.toNumber(document.getElementById('itemPrecio').value),
    vendedor: document.getElementById('itemVendedor').value.trim(),
    garantiaMeses: GV_IO.toNumber(document.getElementById('itemGarantia').value),
    estado,
    fechaBaja: estado === 'baja' ? document.getElementById('itemFechaBaja').value : '',
    observaciones: document.getElementById('itemObservaciones').value.trim()
  };
  if (id) { const idx = ITEMS.findIndex(i => i.id === id); if (idx > -1) ITEMS[idx] = obj; }
  else ITEMS.push(obj);
  gvCloseModal('itemOverlay');
  gvSaveState();
}

function gvDeleteItem() {
  const id = document.getElementById('itemId').value;
  if (!id || !confirm('¿Eliminar este artículo?')) return;
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

function gvNormalizeEstado(raw, fechaBaja) {
  const s = String(raw).trim().toLowerCase();
  if (['baja', 'de baja', '0', '0.0', 'false', 'no'].includes(s)) return 'baja';
  if (fechaBaja) return 'baja';
  return 'activo';
}

function gvParseWorkbook(wb) {
  const sheetName = wb.SheetNames.find(n => /inventario/i.test(n)) || wb.SheetNames[0];
  const rows = GV_IO.sheetToRows(wb.Sheets[sheetName]);
  const pick = (row, keys) => { for (const k of keys) { if (row[k] !== undefined && row[k] !== '') return row[k]; } return ''; };

  return rows.map(row => {
    const fechaBaja = GV_IO.excelDateToISO(pick(row, ['Fecha baja', 'Fecha de baja']));
    return {
      id: GV_STORE.uid(),
      categoria: String(pick(row, ['Categoría', 'Categoria']) || 'Otro').trim(),
      articulo: String(pick(row, ['Artículo', 'Articulo'])).trim(),
      marcaModelo: String(pick(row, ['Marca / Modelo', 'Marca/Modelo', 'Marca'])).trim(),
      fechaCompra: GV_IO.excelDateToISO(pick(row, ['Fecha compra', 'Fecha'])),
      precio: GV_IO.toNumber(pick(row, ['Precio (€)', 'Precio'])),
      vendedor: String(pick(row, ['Vendedor / Tienda', 'Vendedor', 'Tienda'])).trim(),
      garantiaMeses: GV_IO.toNumber(pick(row, ['Garantía (meses)', 'Garantia (meses)', 'Garantía'])),
      estado: gvNormalizeEstado(pick(row, ['Estado']), fechaBaja),
      fechaBaja,
      observaciones: String(pick(row, ['Observaciones', 'Notas'])).trim()
    };
  }).filter(i => i.articulo);
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
      gvToast(`Importados ${newItems.length} artículo(s) ✓`);
    }
  }).catch(err => { console.error(err); gvToast('No se pudo leer el archivo'); });
}

function gvResolveImport(mode) {
  if (!pendingImportData) return;
  if (mode === 'reemplazar') {
    ITEMS = pendingImportData;
  } else {
    const sig = i => [i.categoria, i.articulo, i.fechaCompra, i.precio].join('|').toLowerCase();
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
  if (format === 'csv') GV_IO.downloadCSV(gvRowsOrHeader(rows, headers), 'inventario.csv');
  else GV_IO.downloadWorkbook([{ name: 'Inventario', rows: gvRowsOrHeader(rows, headers) }], 'inventario.xlsx');
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
  document.getElementById('categoryTabs').addEventListener('click', gvOnTabsClick);
  document.getElementById('itemsBody').addEventListener('click', gvOnTableClick);
  document.getElementById('sideCol').addEventListener('click', gvOnSideColClick);
  document.querySelector('#itemsTable thead').addEventListener('click', gvOnHeaderClick);

  if (ITEMS.length > 0) gvShowApp();
  else document.getElementById('emptyState').style.display = 'block';
  gvTryReconnect();
}
document.addEventListener('DOMContentLoaded', gvInit);