const GV_APPS = [
  {
    id: 'garaje',
    icon: '🚗',
    name: 'Garaje',
    desc: 'Gastos, mantenimiento y vencimientos de tus vehículos.',
    href: './garaje/index.html',
    accent: '#00d084',
    countKey: 'gv_garaje_gastos',
    countLabel: (n) => n === 0 ? 'Sin datos todavía' : `${n} gasto${n === 1 ? '' : 's'} registrado${n === 1 ? '' : 's'}`,
    ready: true
  },
  {
    id: 'inventario',
    icon: '📦',
    name: 'Inventario',
    desc: 'Qué compraste, cuándo y cuánto te está durando de verdad.',
    href: './inventario/index.html',
    accent: '#4f8cff',
    countKey: 'gv_inventario_items',
    countLabel: (n) => n === 0 ? 'Sin datos todavía' : `${n} artículo${n === 1 ? '' : 's'}`,
    ready: false
  },
  {
    id: 'deudas',
    icon: '💸',
    name: 'Deudas',
    desc: 'Quién te debe, a quién debes, y qué queda pendiente.',
    href: './deudas/index.html',
    accent: '#f5a623',
    countKey: 'gv_deudas_items',
    countLabel: (n) => n === 0 ? 'Sin datos todavía' : `${n} movimiento${n === 1 ? '' : 's'}`,
    ready: false
  },
  {
    id: 'laboral',
    icon: '💼',
    name: 'Vida Laboral',
    desc: 'Historial de empresas, puestos y contratos.',
    href: './vida-laboral/index.html',
    accent: '#c084fc',
    countKey: 'gv_laboral_items',
    countLabel: (n) => n === 0 ? 'Sin datos todavía' : `${n} experiencia${n === 1 ? '' : 's'}`,
    ready: false
  }
];

function gvRenderHub() {
  const grid = document.getElementById('hubGrid');
  grid.innerHTML = GV_APPS.map(app => {
    const count = (GV_STORE.get(app.countKey, []) || []).length;
    const style = `--accent:${app.accent}`;
    if (!app.ready) {
      return `
        <div class="hub-card disabled" style="${style}">
          <span class="soon">Próximamente</span>
          <span class="icon">${app.icon}</span>
          <h3>${app.name}</h3>
          <p>${app.desc}</p>
        </div>`;
    }
    return `
      <a class="hub-card" href="${app.href}" style="${style}">
        <span class="icon">${app.icon}</span>
        <h3>${app.name}</h3>
        <p>${app.desc}</p>
        <span class="stat">${app.countLabel(count)}</span>
      </a>`;
  }).join('');
}

gvRenderHub();
