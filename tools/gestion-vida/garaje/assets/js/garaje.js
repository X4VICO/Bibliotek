// ---------- Estado ----------
let GASTOS = GV_STORE.get('gv_garaje_gastos', []);
let VEHICULOS = GV_STORE.get('gv_garaje_vehiculos', []);
let activeVehicle = 'todos';
let pendingImportData = null;
let gvChartInstance = null;
let toastTimer = null;

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

// ---------- Persistencia ----------
function gvSaveState() {
  GV_STORE.set('gv_garaje_gastos', GASTOS);
  GV_STORE.set('gv_garaje_vehiculos', VEHICULOS);
  gvToast('Guardado ✓');
  gvRenderAll();
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
    html += `<button class="tab ${activeVehicle === n ? 'active' : ''}" data-vehicle="${gvAttrEsc(n)}">${gvHtmlEsc(n)}</button>`;
  });
  html += `<button class="tab add" data-action="add-vehicle">+ Vehículo</button>`;
  document.getElementById('vehicleTabs').innerHTML = html;
}

function gvComputeStats(filtered) {
  const total = filtered.reduce((s, g) => s + (g.coste || 0), 0);
  const year = new Date().getFullYear();
  const totalYear = filtered
    .filter(g => g.fechaInicio && g.fechaInicio.slice(0, 4) === String(year))
    .reduce((s, g) => s + (g.coste || 0), 0);
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
function gvMonthlyData(filtered) {
  const map = {};
  filtered.forEach(g => {
    if (!g.fechaInicio) return;
    const key = g.fechaInicio.slice(0, 7);
    map[key] = (map[key] || 0) + (g.coste || 0);
  });
  const keys = Object.keys(map).sort();
  const last = keys.slice(-12);
  return { labels: last.map(gvMonthLabel), data: last.map(k => Math.round(map[k] * 100) / 100) };
}

function gvRenderSideCol(filtered) {
  const container = document.getElementById('sideCol');
  if (activeVehicle === 'todos') {
    const names = gvAllVehicleNames();
    const totals = names
      .map(n => ({ n, total: GASTOS.filter(g => g.vehiculo === n).reduce((s, g) => s + (g.coste || 0), 0) }))
      .sort((a, b) => b.total - a.total);
    container.innerHTML = `
      <div class="card" style="margin-bottom:1rem;">
        <h3>Por vehículo</h3>
        ${totals.length
          ? totals.map(t => `<div class="info-row"><span class="k">${gvHtmlEsc(t.n)}</span><span class="v">${gvFormatMoney(t.total)}</span></div>`).join('')
          : '<p style="color:var(--text-dim); font-size:.85rem; margin:0;">Añade un vehículo con el botón "+ Vehículo" para empezar.</p>'}
      </div>
      <div class="card">
        <h3>Gasto mensual</h3>
        <div class="chart-wrap"><canvas id="gastoChart"></canvas></div>
      </div>`;
  } else {
    const veh = VEHICULOS.find(v => v.nombre === activeVehicle) || { nombre: activeVehicle };
    container.innerHTML = `
      <div class="card" style="margin-bottom:1rem;">
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
      <div class="card">
        <h3>Gasto mensual</h3>
        <div class="chart-wrap"><canvas id="gastoChart"></canvas></div>
      </div>`;
    document.getElementById('vehEditBtn').addEventListener('click', () => gvOpenVehiculoModal(veh));
  }
  gvRenderChart(filtered);
}

function gvRenderChart(filtered) {
  const ctx = document.getElementById('gastoChart');
  if (!ctx) return;
  const { labels, data } = gvMonthlyData(filtered);
  if (gvChartInstance) gvChartInstance.destroy();
  gvChartInstance = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: [{ label: '€', data, backgroundColor: '#00d084', borderRadius: 4, maxBarThickness: 28 }] },
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
  rows.sort((a, b) => (b.fechaInicio || '').localeCompare(a.fechaInicio || ''));
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
  if (tab) { activeVehicle = tab.dataset.vehicle; gvRenderAll(); }
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

function gvProcessFile(file) {
  GV_IO.readWorkbookFromFile(file).then(wb => {
    const gastosSheetName = wb.SheetNames.find(n => /gasto/i.test(n)) || wb.SheetNames[0];
    const vehSheetName = wb.SheetNames.find(n => n !== gastosSheetName && /veh[ií]cul/i.test(n));
    const gastosRows = GV_IO.sheetToRows(wb.Sheets[gastosSheetName]);
    const vehRows = vehSheetName ? GV_IO.sheetToRows(wb.Sheets[vehSheetName]) : [];

    const pick = (row, keys) => {
      for (const k of keys) { if (row[k] !== undefined && row[k] !== '') return row[k]; }
      return '';
    };

    const newGastos = gastosRows.map(row => ({
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

    const newVehiculos = vehRows.map(row => ({
      nombre: String(pick(row, ['Vehículo', 'Vehiculo', 'Nombre'])).trim(),
      marcaModelo: String(pick(row, ['Marca / Modelo', 'Marca/Modelo', 'Marca'])).trim(),
      matricula: String(pick(row, ['Matrícula', 'Matricula'])).trim(),
      fechaAlta: GV_IO.excelDateToISO(pick(row, ['Fecha alta', 'Fecha compra'])),
      neumaticos: String(pick(row, ['Neumáticos', 'Neumaticos'])).trim(),
      bateria: String(pick(row, ['Batería', 'Bateria'])).trim(),
      aceite: String(pick(row, ['Aceite'])).trim(),
      notas: String(pick(row, ['Notas'])).trim()
    })).filter(v => v.nombre);

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

// ---------- Exportar ----------
function gvExport(format) {
  if (GASTOS.length === 0 && VEHICULOS.length === 0) { gvToast('No hay datos para exportar'); return; }
  const gastosHeaders = ['Vehículo', 'Categoría', 'Descripción', 'Coste (€)', 'Fecha inicio', 'Fecha final', 'Kilometraje', 'Proveedor / Link', 'Notas'];
  const gastosRows = GASTOS.map(g => ({
    'Vehículo': g.vehiculo, 'Categoría': g.categoria, 'Descripción': g.descripcion,
    'Coste (€)': g.coste, 'Fecha inicio': g.fechaInicio, 'Fecha final': g.fechaFinal,
    'Kilometraje': g.kilometraje, 'Proveedor / Link': g.proveedor, 'Notas': g.notas
  }));
  if (format === 'csv') {
    GV_IO.downloadCSV(gvRowsOrHeader(gastosRows, gastosHeaders), 'garaje-gastos.csv');
  } else {
    const vehHeaders = ['Vehículo', 'Marca / Modelo', 'Matrícula', 'Neumáticos', 'Batería', 'Aceite', 'Fecha alta', 'Notas'];
    const vehRows = VEHICULOS.map(v => ({
      'Vehículo': v.nombre, 'Marca / Modelo': v.marcaModelo, 'Matrícula': v.matricula,
      'Neumáticos': v.neumaticos, 'Batería': v.bateria, 'Aceite': v.aceite, 'Fecha alta': v.fechaAlta, 'Notas': v.notas
    }));
    GV_IO.downloadWorkbook([
      { name: 'Garaje - Gastos', rows: gvRowsOrHeader(gastosRows, gastosHeaders) },
      { name: 'Garaje - Vehículos', rows: gvRowsOrHeader(vehRows, vehHeaders) }
    ], 'garaje.xlsx');
  }
  const menu = document.getElementById('exportMenu');
  if (menu) menu.classList.remove('open');
  gvToast('Descargado ✓');
}

// ---------- Barra de acciones superior ----------
function gvRenderTopActions() {
  document.getElementById('topActions').innerHTML = `
    <button class="btn ghost small" id="btnImportTop">📥 Importar</button>
    <input type="file" id="fileInputTop" accept=".xlsx,.xls,.csv" style="display:none;">
    <div class="menu-wrap">
      <button class="btn ghost small" id="btnExportTop">⬇ Exportar</button>
      <div class="menu" id="exportMenu">
        <button id="btnExportXlsx">Descargar .xlsx</button>
        <button id="btnExportCsv">Descargar .csv (gastos)</button>
      </div>
    </div>
    <button class="btn ghost small" id="btnTemplateTop">🧾 Plantilla</button>
  `;
  document.getElementById('btnImportTop').addEventListener('click', () => document.getElementById('fileInputTop').click());
  document.getElementById('fileInputTop').addEventListener('change', e => { const f = e.target.files[0]; if (f) gvProcessFile(f); e.target.value = ''; });
  document.getElementById('btnExportTop').addEventListener('click', e => { e.stopPropagation(); document.getElementById('exportMenu').classList.toggle('open'); });
  document.getElementById('btnExportXlsx').addEventListener('click', () => gvExport('xlsx'));
  document.getElementById('btnExportCsv').addEventListener('click', () => gvExport('csv'));
  document.getElementById('btnTemplateTop').addEventListener('click', gvDownloadFullTemplate);
}
document.addEventListener('click', () => { const m = document.getElementById('exportMenu'); if (m) m.classList.remove('open'); });

// ---------- Init ----------
function gvInit() {
  gvRenderTopActions();
  document.getElementById('fileInput').addEventListener('change', e => { const f = e.target.files[0]; if (f) gvProcessFile(f); e.target.value = ''; });
  gvSetupDropzone();
  document.getElementById('searchInput').addEventListener('input', gvRenderTable);
  document.getElementById('vehicleTabs').addEventListener('click', gvOnTabsClick);
  document.getElementById('gastosBody').addEventListener('click', gvOnTableClick);

  if (GASTOS.length > 0 || VEHICULOS.length > 0) {
    gvShowApp();
  } else {
    document.getElementById('emptyState').style.display = 'block';
  }
}
document.addEventListener('DOMContentLoaded', gvInit);
