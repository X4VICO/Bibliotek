let isReadmeOpen = false;

window.toggleReadme = async function() {
  const readmeCard = document.getElementById('readmeCard');
  const readmeContent = document.getElementById('readmeContent');
  const readmeBtn = document.getElementById('readmeBtn');

  if (!readmeCard || !readmeContent || !readmeBtn) return;

  if (isReadmeOpen) {
    readmeCard.style.display = 'none';
    readmeBtn.innerHTML = '📖 Ver README';
    readmeBtn.classList.remove('active'); // 👈 Quita el estilo activo
    isReadmeOpen = false;
    return;
  }

  readmeCard.style.display = 'block';
  readmeBtn.innerHTML = '❌ Ocultar README';
  readmeBtn.classList.add('active'); // 👈 Activa el borde verde al desplegar
  readmeContent.innerHTML = '<p>⏳ Cargando README.md...</p>';
  isReadmeOpen = true;

  readmeCard.scrollIntoView({ behavior: 'smooth', block: 'start' });

  try {
    const res = await fetch('./README.md');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    
    const text = await res.text();
    
    if (typeof marked !== 'undefined') {
      readmeContent.innerHTML = marked.parse(text);
    } else {
      readmeContent.innerHTML = `<pre style="white-space: pre-wrap;">${text}</pre>`;
    }
  } catch (err) {
    console.error('Error al cargar README.md:', err);
    readmeContent.innerHTML = `
      <div style="color: #f87171; border: 1px dashed #f87171; padding: 1rem; border-radius: 8px;">
        ⚠️ <strong>No se pudo cargar el README.md automáticamente.</strong><br>
        <small>${err.message}</small>
      </div>`;
  }
};

window.copyCloneCmd = function(cmd) {
  navigator.clipboard.writeText(cmd);
  alert('Comando copiado al portapapeles: ' + cmd);
};

document.addEventListener('DOMContentLoaded', () => {
  const grid = document.getElementById('toolsGrid');
  const searchInput = document.getElementById('searchInput');
  const filterPills = document.querySelectorAll('.filter-pills .pill');

  let currentCategory = 'all';
  let registryData = [];

  if (!grid) return;

  fetch('./assets/data/registry.json')
    .then(response => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
    .then(data => {
      registryData = data;
      renderCards(registryData);
    })
    .catch(err => {
      grid.innerHTML = `
        <div class="empty-state" style="color: #f87171; border: 1px dashed #f87171; padding: 1.5rem; border-radius: 0.5rem;">
          ⚠️ <strong>Error al cargar las herramientas:</strong><br>${err.message}
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