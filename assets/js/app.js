document.addEventListener('DOMContentLoaded', () => {
  const grid = document.getElementById('toolsGrid');
  const searchInput = document.getElementById('searchInput');
  const filterPills = document.querySelectorAll('.pill');

  let currentCategory = 'all';
  let registryData = [];

  if (!grid) {
    console.error("Error: No se encontró el elemento con id 'toolsGrid' en index.html");
    return;
  }

  // Cargar datos dinámicamente desde registry.json
  fetch('./assets/data/registry.json')
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP error! Estado: ${response.status} - No se pudo encontrar registry.json`);
      }
      return response.json();
    })
    .then(data => {
      registryData = data;
      renderCards(registryData);
    })
    .catch(err => {
      console.error('Error al cargar el registro:', err);
      grid.innerHTML = `
        <div class="empty-state" style="color: #f87171; border: 1px dashed #f87171; padding: 1.5rem; border-radius: 0.5rem;">
          ⚠️ <strong>Error al cargar las herramientas:</strong><br>
          ${err.message}<br><br>
          <small>Si estás abriendo el archivo directamente con doble clic (protocolo file://), necesitas usar un servidor local como Live Server en VS Code o subirlo a GitHub Pages.</small>
        </div>
      `;
    });

  function renderCards(data) {
    grid.innerHTML = '';

    const filtered = data.filter(item => {
      const matchesCategory = currentCategory === 'all' || item.category === currentCategory;
      const query = searchInput ? searchInput.value.toLowerCase() : '';
      const matchesSearch = item.title.toLowerCase().includes(query) ||
                            item.description.toLowerCase().includes(query) ||
                            (item.tags && item.tags.some(t => t.toLowerCase().includes(query)));
      return matchesCategory && matchesSearch;
    });

    if (filtered.length === 0) {
      grid.innerHTML = `<div class="empty-state">No se encontraron elementos que coincidan con la búsqueda.</div>`;
      return;
    }

    filtered.forEach(item => {
      const card = document.createElement('div');
      card.className = 'card';

      const isWeb = item.type === 'web';
      const badgeClass = isWeb ? 'badge-web' : 'badge-repo';
      const badgeText = isWeb ? '🌐 Web Online' : '🖥️ Local / Repo';

      const tagsHTML = item.tags ? item.tags.map(t => `<span class="tag">${t}</span>`).join('') : '';
      const reqsHTML = item.requirements ? `<div class="requirements">${item.requirements}</div>` : '';

      let actionsHTML = isWeb 
        ? `<a href="${item.path}" class="btn btn-primary">Abrir App ➡️</a>`
        : `
            <a href="${item.github}" target="_blank" class="btn btn-primary">Ver Repo 👁️</a>
            <button onclick="copyCloneCmd('${item.cloneCmd}')" class="btn btn-secondary">Git clone 📋</button>
          `;

      card.innerHTML = `
        <div>
          <div class="card-header">
            <h2 class="card-title">${item.title}</h2>
            <span class="badge ${badgeClass}">${badgeText}</span>
          </div>
          <p class="card-description">${item.description}</p>
          ${reqsHTML}
          <div class="tags">${tagsHTML}</div>
        </div>
        <div class="card-actions">
          ${actionsHTML}
        </div>
      `;

      grid.appendChild(card);
    });
  }

  window.copyCloneCmd = function(cmd) {
    navigator.clipboard.writeText(cmd);
    alert('Comando copiado al portapapeles: ' + cmd);
  };

  if (searchInput) {
    searchInput.addEventListener('input', () => renderCards(registryData));
  }

  filterPills.forEach(pill => {
    pill.addEventListener('click', () => {
      filterPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      currentCategory = pill.dataset.filter;
      renderCards(registryData);
    });
  });
});