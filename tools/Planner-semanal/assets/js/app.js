(function(){
  const DAYS = ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'];
  const DAYS_SHORT = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
  const STEP = 30; // minutos por franja
  const DEFAULT_CATEGORIES = [
    {id:'trabajo',  label:'Trabajo',   color:'#4F5DFF'},
    {id:'estudio',  label:'Estudio',   color:'#8B5CF6'},
    {id:'ejercicio',label:'Ejercicio', color:'#F97F51'},
    {id:'personal', label:'Personal',  color:'#22B07D'},
    {id:'descanso', label:'Descanso',  color:'#00C9B7'},
    {id:'otro',     label:'Otro',      color:'#8890A0'},
  ];
  let CATEGORIES = DEFAULT_CATEGORIES.map(c=>({...c}));
  const catById = id => CATEGORIES.find(c=>c.id===id) || CATEGORIES[CATEGORIES.length-1];
  const todayIdx = (new Date().getDay() + 6) % 7; // Lunes=0

  const LS_SETTINGS = 'planner-semanal:settings';
  const LS_EVENTS = 'planner-semanal:events';
  const LS_THEME = 'planner-semanal:theme';
  const LS_CATEGORIES = 'planner-semanal:categories';

  let settings = {start:5, end:22};
  let events = [];
  let drag = null;
  let editingId = null;
  let pendingRange = null;
  let selectedCategory = CATEGORIES[0].id;

  const grid = document.getElementById('grid');
  const statusEl = document.getElementById('status');
  const overlay = document.getElementById('overlay');
  const chipsEl = document.getElementById('chips');
  const titleInput = document.getElementById('titleInput');
  const cardRange = document.getElementById('cardRange');
  const cardTitle = document.getElementById('cardTitle');
  const deleteBtn = document.getElementById('deleteBtn');
  const settingsOverlay = document.getElementById('settingsOverlay');
  const startSelect = document.getElementById('startSelect');
  const endSelect = document.getElementById('endSelect');
  const settingsError = document.getElementById('settingsError');
  const themeBtn = document.getElementById('themeBtn');
  const labelsOverlay = document.getElementById('labelsOverlay');
  const labelsForm = document.getElementById('labelsForm');
  const exportOverlay = document.getElementById('exportOverlay');
  const importInput = document.getElementById('importInput');

  function pad(n){return n.toString().padStart(2,'0');}
  function timeLabel(mins){
    const h = Math.floor(mins/60), m = mins%60;
    return pad(h)+':'+pad(m);
  }
  // ---------- STATUS CLOCK ----------
  // En reposo, el indicador de estado muestra la hora actual (más útil que
  // un "guardado" fijo); los mensajes puntuales (guardando…, importado…) lo
  // sustituyen un momento y luego se vuelve a la hora.
  let clockInterval = null;
  function formatClock(){
    const d = new Date();
    return pad(d.getHours())+':'+pad(d.getMinutes());
  }
  function showClock(){
    statusEl.textContent = formatClock();
  }
  function startClock(){
    showClock();
    if(clockInterval) clearInterval(clockInterval);
    clockInterval = setInterval(showClock, 15000);
  }
  function hexToRgba(hex, a){
    const v = hex.replace('#','');
    const r = parseInt(v.substring(0,2),16);
    const g = parseInt(v.substring(2,4),16);
    const b = parseInt(v.substring(4,6),16);
    return `rgba(${r},${g},${b},${a})`;
  }
  function buildSlots(){
    const s = [];
    for(let m = settings.start*60; m < settings.end*60; m += STEP) s.push(m);
    return s;
  }

  // ---------- THEME ----------
  function loadTheme(){
    try{ return localStorage.getItem(LS_THEME) || 'light'; }
    catch(e){ return 'light'; }
  }
  function applyTheme(t){
    document.documentElement.setAttribute('data-theme', t);
  }
  function saveTheme(t){
    try{ localStorage.setItem(LS_THEME, t); }catch(e){}
  }
  themeBtn.addEventListener('click', ()=>{
    const current = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    const next = current === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    saveTheme(next);
  });

  // ---------- STORAGE (localStorage: persiste por navegador/dispositivo) ----------
  function loadAll(){
    statusEl.textContent = 'cargando…';
    try{
      const raw = localStorage.getItem(LS_SETTINGS);
      if(raw) settings = JSON.parse(raw);
    }catch(e){}
    try{
      const raw = localStorage.getItem(LS_EVENTS);
      events = raw ? JSON.parse(raw) : [];
    }catch(e){ events = []; }
    loadCategories();
    showClock();
    buildGrid();
    render();
  }
  function saveSettings(){
    statusEl.textContent = 'guardando…';
    try{
      localStorage.setItem(LS_SETTINGS, JSON.stringify(settings));
      showClock();
    }catch(e){ statusEl.textContent = 'error al guardar'; setTimeout(showClock, 2500); }
  }
  function saveEvents(){
    statusEl.textContent = 'guardando…';
    try{
      localStorage.setItem(LS_EVENTS, JSON.stringify(events));
      showClock();
    }catch(e){ statusEl.textContent = 'error al guardar'; setTimeout(showClock, 2500); }
  }
  // Combina las categorías guardadas con las de por defecto: conserva CUALQUIER
  // categoría guardada (incluidas las personalizadas con id propio), rellenando
  // nombre/color que falten con los valores por defecto cuando el id coincide.
  // "otro" siempre se garantiza presente, ya que es la categoría de reserva.
  function mergeCategories(saved){
    if(!Array.isArray(saved) || saved.length===0) return DEFAULT_CATEGORIES.map(c=>({...c}));
    const result = [];
    const seen = new Set();
    saved.forEach(c=>{
      if(!c || !c.id || seen.has(c.id)) return;
      const def = DEFAULT_CATEGORIES.find(d=>d.id===c.id);
      result.push({
        id: c.id,
        label: (c.label && String(c.label).trim()) ? String(c.label).trim() : (def ? def.label : 'Otro'),
        color: c.color || (def ? def.color : '#8890A0')
      });
      seen.add(c.id);
    });
    if(!seen.has('otro')){
      const def = DEFAULT_CATEGORIES.find(d=>d.id==='otro');
      result.push({...def});
    }
    return result;
  }
  function loadCategories(){
    try{
      const raw = localStorage.getItem(LS_CATEGORIES);
      CATEGORIES = raw ? mergeCategories(JSON.parse(raw)) : DEFAULT_CATEGORIES.map(c=>({...c}));
    }catch(e){ CATEGORIES = DEFAULT_CATEGORIES.map(c=>({...c})); }
  }
  function saveCategories(){
    try{ localStorage.setItem(LS_CATEGORIES, JSON.stringify(CATEGORIES)); }catch(e){}
  }

  // ---------- BUILD GRID ----------
  function buildGrid(){
    grid.innerHTML = '';
    const slots = buildSlots();

    const corner = document.createElement('div');
    corner.className = 'corner';
    grid.appendChild(corner);

    DAYS_SHORT.forEach((d,i)=>{
      const h = document.createElement('div');
      h.className = 'day-head' + (i===todayIdx ? ' today' : '');
      h.textContent = d;
      grid.appendChild(h);
    });

    const timeCol = document.createElement('div');
    timeCol.className = 'time-col';
    slots.forEach(m=>{
      const lbl = document.createElement('div');
      const onHour = m % 60 === 0;
      lbl.className = 'time-label' + (onHour ? ' hour-mark' : '');
      lbl.innerHTML = onHour ? `<span>${timeLabel(m)}</span>` : '';
      timeCol.appendChild(lbl);
    });
    grid.appendChild(timeCol);

    for(let d=0; d<7; d++){
      const col = document.createElement('div');
      col.className = 'day-col' + (d===todayIdx ? ' today-col' : '');
      col.dataset.day = d;
      col.style.height = (slots.length*ROW_H())+'px';

      slots.forEach(m=>{
        const slot = document.createElement('div');
        const onHour = m % 60 === 0;
        slot.className = 'hour-slot' + (onHour ? ' hour-mark' : '');
        slot.dataset.minute = m;
        col.appendChild(slot);
      });

      const layer = document.createElement('div');
      layer.className = 'block-layer';
      col.appendChild(layer);

      grid.appendChild(col);
      attachDragHandlers(col);
    }

    updateNowLine();
  }

  function ROW_H(){
    return parseInt(getComputedStyle(document.documentElement).getPropertyValue('--row-h'));
  }

  // ---------- DRAG / SELECT ----------
  function attachDragHandlers(col){
    const day = Number(col.dataset.day);

    function startDrag(min){
      drag = {day, start:min, current:min};
      paintSelection();
    }
    function moveDrag(min){
      if(!drag) return;
      drag.current = min;
      paintSelection();
    }
    function endDrag(){
      if(!drag) return;
      const start = Math.min(drag.start, drag.current);
      const end = Math.max(drag.start, drag.current) + STEP;
      drag = null;
      paintSelection();
      openCreateCard(day, start, end);
    }

    col.addEventListener('mousedown', e=>{
      const slot = e.target.closest('.hour-slot');
      if(!slot) return;
      e.preventDefault();
      startDrag(Number(slot.dataset.minute));
      const onMove = ev=>{
        const s = document.elementFromPoint(ev.clientX, ev.clientY);
        const hs = s && s.closest ? s.closest('.hour-slot') : null;
        if(hs && hs.closest('.day-col')===col) moveDrag(Number(hs.dataset.minute));
      };
      const onUp = ()=>{
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        endDrag();
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });

    col.addEventListener('touchstart', e=>{
      const slot = e.target.closest('.hour-slot');
      if(!slot) return;
      startDrag(Number(slot.dataset.minute));
    }, {passive:true});

    col.addEventListener('touchmove', e=>{
      if(!drag) return;
      e.preventDefault();
      const t = e.touches[0];
      const s = document.elementFromPoint(t.clientX, t.clientY);
      const hs = s && s.closest ? s.closest('.hour-slot') : null;
      if(hs && hs.closest('.day-col')===col) moveDrag(Number(hs.dataset.minute));
    }, {passive:false});

    col.addEventListener('touchend', ()=> endDrag());
  }

  function paintSelection(){
    document.querySelectorAll('.hour-slot.selecting').forEach(s=>s.classList.remove('selecting'));
    if(!drag) return;
    const lo = Math.min(drag.start, drag.current);
    const hi = Math.max(drag.start, drag.current);
    const col = grid.querySelector(`.day-col[data-day="${drag.day}"]`);
    if(!col) return;
    col.querySelectorAll('.hour-slot').forEach(s=>{
      const m = Number(s.dataset.minute);
      if(m>=lo && m<=hi) s.classList.add('selecting');
    });
  }

  // ---------- RENDER BLOCKS ----------
  function render(){
    grid.querySelectorAll('.block-layer').forEach(l=>l.innerHTML='');
    const rh = ROW_H();
    events.forEach(ev=>{
      const col = grid.querySelector(`.day-col[data-day="${ev.day}"] .block-layer`);
      if(!col) return;
      const cat = catById(ev.category);
      const div = document.createElement('div');
      div.className = 'block';
      div.style.top = ((ev.start-settings.start*60)/STEP*rh+1)+'px';
      div.style.height = ((ev.end-ev.start)/STEP*rh-2)+'px';
      div.style.background = hexToRgba(cat.color, 0.16);
      div.style.borderLeftColor = cat.color;
      div.innerHTML = `<b>${escapeHtml(ev.title)}</b><span class="t">${timeLabel(ev.start)}–${timeLabel(ev.end)}</span>`;
      div.addEventListener('click', ()=> openEditCard(ev.id));
      col.appendChild(div);
    });
    renderStats();
  }

  function escapeHtml(s){
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function renderStats(){
    const totals = {};
    CATEGORIES.forEach(c=> totals[c.id]=0);
    events.forEach(ev=>{ totals[ev.category] = (totals[ev.category]||0) + (ev.end-ev.start)/60; });
    const grandTotal = Object.values(totals).reduce((a,b)=>a+b,0);

    const bar = document.getElementById('statBar');
    const legend = document.getElementById('legend');
    bar.innerHTML = '';
    legend.innerHTML = '';

    if(grandTotal === 0){
      bar.style.background = 'var(--line)';
      legend.innerHTML = '<div class="empty-note">Todavía no hay bloques esta semana.</div>';
      return;
    }

    CATEGORIES.forEach(c=>{
      const hours = totals[c.id];
      if(hours <= 0) return;
      const seg = document.createElement('div');
      seg.className = 'stat-seg';
      seg.style.width = (hours/grandTotal*100)+'%';
      seg.style.background = c.color;
      bar.appendChild(seg);

      const item = document.createElement('div');
      item.className = 'legend-item';
      const hoursLabel = Number.isInteger(hours) ? hours : hours.toFixed(1);
      item.innerHTML = `<span class="dot" style="background:${c.color}"></span>${c.label} <b>${hoursLabel}h</b>`;
      legend.appendChild(item);
    });
  }

  // ---------- NOW LINE ----------
  function updateNowLine(){
    document.querySelectorAll('.now-line').forEach(n=>n.remove());
    const now = new Date();
    const nowMin = now.getHours()*60 + now.getMinutes();
    if(nowMin < settings.start*60 || nowMin > settings.end*60) return;
    const col = grid.querySelector(`.day-col[data-day="${todayIdx}"]`);
    if(!col) return;
    const line = document.createElement('div');
    line.className = 'now-line';
    line.style.top = ((nowMin-settings.start*60)/STEP*ROW_H())+'px';
    col.appendChild(line);
  }
  setInterval(updateNowLine, 60000);

  // ---------- EVENT MODAL ----------
  function buildChips(){
    chipsEl.innerHTML = '';
    CATEGORIES.forEach(c=>{
      const chip = document.createElement('div');
      chip.className = 'chip' + (c.id===selectedCategory ? ' active':'');
      chip.innerHTML = `<span class="dot" style="background:${c.color}"></span>${c.label}`;
      chip.addEventListener('click', ()=>{
        selectedCategory = c.id;
        buildChips();
      });
      chipsEl.appendChild(chip);
    });
  }

  // ---------- LABELS EDITOR ----------
  const LABEL_PALETTE = ['#4F5DFF','#8B5CF6','#F97F51','#22B07D','#00C9B7','#EF4C6B','#F5A623','#3B82F6'];

  function genCategoryId(){
    return 'cat_' + Date.now().toString(36) + Math.random().toString(36).slice(2,6);
  }

  function createLabelRow(cat){
    const row = document.createElement('div');
    row.className = 'label-row';
    row.dataset.id = cat.id;
    const isLocked = cat.id === 'otro';
    row.innerHTML = `
      <input type="color" class="label-color" value="${cat.color}" aria-label="Color de ${escapeHtml(cat.label)}">
      <input type="text" class="label-text" value="${escapeHtml(cat.label)}" maxlength="18" placeholder="Nombre de la etiqueta">
      ${isLocked
        ? '<span class="label-locked" title="Esta etiqueta no se puede eliminar: recoge los bloques de etiquetas borradas"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg></span>'
        : '<button type="button" class="label-delete" title="Eliminar etiqueta" aria-label="Eliminar etiqueta">✕</button>'}
    `;
    return row;
  }

  function buildLabelsForm(){
    labelsForm.innerHTML = '';
    CATEGORIES.forEach(c=> labelsForm.appendChild(createLabelRow(c)));
  }

  // Elimina la fila al pulsar su botón (delegación: funciona también con filas añadidas después)
  labelsForm.addEventListener('click', e=>{
    const btn = e.target.closest('.label-delete');
    if(!btn) return;
    const row = btn.closest('.label-row');
    if(row) row.remove();
  });

  document.getElementById('labelsAddBtn').addEventListener('click', ()=>{
    const count = labelsForm.querySelectorAll('.label-row').length;
    const color = LABEL_PALETTE[count % LABEL_PALETTE.length];
    const row = createLabelRow({id: genCategoryId(), label:'', color});
    labelsForm.appendChild(row);
    row.querySelector('.label-text').focus();
    labelsForm.scrollTop = labelsForm.scrollHeight;
  });

  document.getElementById('labelsBtn').addEventListener('click', ()=>{
    buildLabelsForm();
    openOverlay(labelsOverlay);
  });
  document.getElementById('labelsCancelBtn').addEventListener('click', ()=>closeOverlay(labelsOverlay));
  labelsOverlay.addEventListener('click', e=>{ if(e.target===labelsOverlay) closeOverlay(labelsOverlay); });

  // Sustituye la lista de categorías, reasignando a "otro" los bloques cuya
  // etiqueta ha desaparecido. Devuelve cuántos bloques se han reasignado.
  function applyCategoryChange(newCats){
    const oldIds = CATEGORIES.map(c=>c.id);
    const newIds = newCats.map(c=>c.id);
    const removedIds = oldIds.filter(id=> !newIds.includes(id));
    let reassigned = 0;
    if(removedIds.length){
      events.forEach(ev=>{
        if(removedIds.includes(ev.category)){
          ev.category = 'otro';
          reassigned++;
        }
      });
    }
    CATEGORIES = newCats;
    saveCategories();
    if(reassigned>0) saveEvents();
    return reassigned;
  }

  function flashStatus(msg, ms){
    statusEl.textContent = msg;
    setTimeout(showClock, ms || 1800);
  }

  document.getElementById('labelsResetBtn').addEventListener('click', ()=>{
    if(!confirm('¿Restaurar las etiquetas por defecto? Se eliminarán las etiquetas personalizadas que hayas añadido.')) return;
    const reassigned = applyCategoryChange(DEFAULT_CATEGORIES.map(c=>({...c})));
    buildLabelsForm();
    render();
    flashStatus(reassigned>0 ? `restaurado (${reassigned} bloque${reassigned===1?'':'s'} → Otro)` : 'guardado', 3000);
  });

  document.getElementById('labelsSaveBtn').addEventListener('click', ()=>{
    const rows = Array.from(labelsForm.querySelectorAll('.label-row'));
    const newCats = [];
    for(const row of rows){
      const textInput = row.querySelector('.label-text');
      const colorInput = row.querySelector('.label-color');
      const label = textInput.value.trim();
      if(!label){
        textInput.focus();
        alert('Todas las etiquetas necesitan un nombre. Rellénala o elimínala.');
        return;
      }
      newCats.push({id: row.dataset.id, label, color: colorInput.value});
    }
    // "Otro" no tiene botón de eliminar, así que siempre debería seguir en la lista;
    // esto es solo una salvaguarda por si acaso.
    if(!newCats.some(c=>c.id==='otro')){
      const fallback = catById('otro');
      newCats.push({...fallback});
    }
    const reassigned = applyCategoryChange(newCats);
    render();
    closeOverlay(labelsOverlay);
    flashStatus(reassigned>0 ? `guardado (${reassigned} bloque${reassigned===1?'':'s'} → Otro)` : 'guardado', 3000);
  });

  function openCreateCard(day, start, end){
    editingId = null;
    pendingRange = {day, start, end};
    selectedCategory = CATEGORIES[0].id;
    cardTitle.textContent = 'Nuevo bloque';
    cardRange.textContent = `${DAYS[day]} · ${timeLabel(start)}–${timeLabel(end)}`;
    titleInput.value = '';
    deleteBtn.style.display = 'none';
    buildChips();
    openOverlay(overlay);
  }

  function openEditCard(id){
    const ev = events.find(e=>e.id===id);
    if(!ev) return;
    editingId = id;
    pendingRange = {day:ev.day, start:ev.start, end:ev.end};
    selectedCategory = ev.category;
    cardTitle.textContent = 'Editar bloque';
    cardRange.textContent = `${DAYS[ev.day]} · ${timeLabel(ev.start)}–${timeLabel(ev.end)}`;
    titleInput.value = ev.title;
    deleteBtn.style.display = '';
    buildChips();
    openOverlay(overlay);
  }

  function openOverlay(el){
    el.classList.add('open');
    if(el===overlay) setTimeout(()=>titleInput.focus(), 50);
  }
  function closeOverlay(el){
    el.classList.remove('open');
    if(el===overlay){ editingId = null; pendingRange = null; }
  }

  document.getElementById('cancelBtn').addEventListener('click', ()=>closeOverlay(overlay));
  overlay.addEventListener('click', e=>{ if(e.target===overlay) closeOverlay(overlay); });

  document.getElementById('saveBtn').addEventListener('click', ()=>{
    const title = titleInput.value.trim();
    if(!title || !pendingRange) return;
    if(editingId){
      const ev = events.find(e=>e.id===editingId);
      ev.title = title;
      ev.category = selectedCategory;
    } else {
      events.push({
        id: 'ev_' + Date.now() + '_' + Math.random().toString(36).slice(2,7),
        day: pendingRange.day,
        start: pendingRange.start,
        end: pendingRange.end,
        title,
        category: selectedCategory
      });
    }
    render();
    saveEvents();
    closeOverlay(overlay);
  });

  titleInput.addEventListener('keydown', e=>{
    if(e.key==='Enter') document.getElementById('saveBtn').click();
  });

  deleteBtn.addEventListener('click', ()=>{
    if(!editingId) return;
    events = events.filter(e=>e.id!==editingId);
    render();
    saveEvents();
    closeOverlay(overlay);
  });

  document.getElementById('clearBtn').addEventListener('click', ()=>{
    if(events.length===0) return;
    if(confirm('¿Vaciar todos los bloques de la semana? Esta acción no se puede deshacer.')){
      events = [];
      render();
      saveEvents();
    }
  });

  // ---------- SETTINGS MODAL ----------
  function populateHourSelects(){
    startSelect.innerHTML = '';
    endSelect.innerHTML = '';
    for(let h=0; h<24; h++){
      const label = pad(h)+':00';
      const o1 = document.createElement('option'); o1.value=h; o1.textContent=label;
      const o2 = document.createElement('option'); o2.value=h; o2.textContent=label;
      startSelect.appendChild(o1);
      endSelect.appendChild(o2);
    }
  }
  function openSettings(){
    startSelect.value = settings.start;
    endSelect.value = settings.end;
    settingsError.style.display = 'none';
    openOverlay(settingsOverlay);
  }
  document.getElementById('settingsBtn').addEventListener('click', openSettings);
  document.getElementById('settingsCancelBtn').addEventListener('click', ()=>closeOverlay(settingsOverlay));
  settingsOverlay.addEventListener('click', e=>{ if(e.target===settingsOverlay) closeOverlay(settingsOverlay); });

  document.getElementById('settingsSaveBtn').addEventListener('click', ()=>{
    const s = Number(startSelect.value);
    const e = Number(endSelect.value);
    if(e <= s){
      settingsError.style.display = 'block';
      return;
    }
    settings = {start:s, end:e};
    saveSettings();
    buildGrid();
    render();
    closeOverlay(settingsOverlay);
  });

  document.addEventListener('keydown', e=>{
    if(e.key!=='Escape') return;
    if(overlay.classList.contains('open')) closeOverlay(overlay);
    if(settingsOverlay.classList.contains('open')) closeOverlay(settingsOverlay);
    if(labelsOverlay.classList.contains('open')) closeOverlay(labelsOverlay);
    if(exportOverlay.classList.contains('open')) closeOverlay(exportOverlay);
  });

  // ---------- DOWNLOAD AS IMAGE ----------
  async function downloadImage(){
    if(typeof html2canvas === 'undefined'){
      statusEl.textContent = 'no disponible';
      setTimeout(showClock, 1800);
      return;
    }
    statusEl.textContent = 'generando…';

    const wrapper = document.createElement('div');
    wrapper.style.position = 'fixed';
    wrapper.style.left = '-99999px';
    wrapper.style.top = '0';
    wrapper.style.background = '#FFFFFF';
    wrapper.style.padding = '32px';
    wrapper.style.fontFamily = "'Space Grotesk', sans-serif";
    wrapper.style.width = 'fit-content';

    // La exportación siempre usa colores claros, independientemente del tema
    // activo en pantalla, y con líneas más discretas y texto más legible.
    const EXPORT_VARS = {
      '--bg':'#FFFFFF', '--surface':'#FFFFFF', '--ink':'#12141C', '--ink-soft':'#5B6472',
      '--ink-faint':'#9098AC', '--line':'#DCDFE6', '--line-hour':'#C7CCD8',
      '--accent':'#4F5DFF', '--accent-2':'#00C9B7', '--accent-soft':'#EEF0FF', '--danger':'#E5484D'
    };
    Object.keys(EXPORT_VARS).forEach(k=> wrapper.style.setProperty(k, EXPORT_VARS[k]));

    const titleEl = document.createElement('div');
    const now = new Date();
    titleEl.style.display = 'flex';
    titleEl.style.alignItems = 'baseline';
    titleEl.style.gap = '10px';
    titleEl.style.marginBottom = '16px';
    titleEl.innerHTML = `<span style="font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:20px;color:#12141C;">Horario semanal</span>
      <span style="font-family:'JetBrains Mono',monospace;font-size:11px;color:#9098AC;">Generado el ${pad(now.getDate())}/${pad(now.getMonth()+1)}/${now.getFullYear()}</span>`;
    wrapper.appendChild(titleEl);

    const gridClone = grid.cloneNode(true);
    gridClone.style.minWidth = 'auto';
    // Al exportar no se destaca el día ni la hora actuales: es útil mientras
    // planificas, pero no tiene sentido en una imagen guardada o impresa.
    gridClone.querySelectorAll('.now-line').forEach(el=> el.remove());
    gridClone.querySelectorAll('.today-col').forEach(el=> el.classList.remove('today-col'));
    gridClone.querySelectorAll('.day-head.today').forEach(el=> el.classList.remove('today'));
    // El texto de cada bloque en negro sólido para que se lea bien siempre,
    // sin depender del tema claro/oscuro activo en pantalla.
    gridClone.querySelectorAll('.block b, .block .t').forEach(el=>{ el.style.color = '#12141C'; });
    wrapper.appendChild(gridClone);

    const legendClone = document.getElementById('legend').cloneNode(true);
    if(legendClone.children.length){
      legendClone.style.marginTop = '18px';
      legendClone.style.paddingTop = '14px';
      legendClone.style.borderTop = '1px solid #EEEBE2';
      legendClone.style.display = 'flex';
      legendClone.style.flexWrap = 'wrap';
      legendClone.style.gap = '8px 18px';
      wrapper.appendChild(legendClone);
    }

    document.body.appendChild(wrapper);
    try{
      const canvas = await html2canvas(wrapper, {backgroundColor:'#FFFFFF', scale:2});
      const link = document.createElement('a');
      link.download = 'horario-semanal.png';
      link.href = canvas.toDataURL('image/png');
      link.click();
      statusEl.textContent = 'imagen lista';
    }catch(e){
      statusEl.textContent = 'error al generar';
    }finally{
      document.body.removeChild(wrapper);
      setTimeout(showClock, 2000);
    }
  }
  document.getElementById('downloadBtn').addEventListener('click', ()=>{
    openOverlay(exportOverlay);
  });
  document.getElementById('exportCancelBtn').addEventListener('click', ()=>closeOverlay(exportOverlay));
  exportOverlay.addEventListener('click', e=>{ if(e.target===exportOverlay) closeOverlay(exportOverlay); });

  document.getElementById('exportImageBtn').addEventListener('click', ()=>{
    closeOverlay(exportOverlay);
    downloadImage();
  });
  document.getElementById('exportFileBtn').addEventListener('click', ()=>{
    closeOverlay(exportOverlay);
    downloadDataFile();
  });

  // ---------- DOWNLOAD AS DATA FILE (.json) ----------
  function downloadDataFile(){
    try{
      statusEl.textContent = 'generando…';
      const data = {
        app: 'planner-semanal',
        version: 1,
        exportedAt: new Date().toISOString(),
        settings,
        categories: CATEGORIES,
        events
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.download = 'horario-semanal.json';
      link.href = url;
      link.click();
      URL.revokeObjectURL(url);
      statusEl.textContent = 'archivo listo';
    }catch(e){
      statusEl.textContent = 'error al generar';
    }finally{
      setTimeout(showClock, 2000);
    }
  }

  // ---------- IMPORT FROM DATA FILE ----------
  document.getElementById('importBtn').addEventListener('click', ()=> importInput.click());
  importInput.addEventListener('change', e=>{
    const file = e.target.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = ()=>{
      try{
        const data = JSON.parse(reader.result);
        if(!data || !Array.isArray(data.events)) throw new Error('formato inválido');
        const proceed = confirm('Importar este archivo reemplazará tu horario, configuración y etiquetas actuales. ¿Continuar?');
        if(!proceed) return;

        if(data.settings && Number.isFinite(data.settings.start) && Number.isFinite(data.settings.end) && data.settings.end > data.settings.start){
          settings = {start:data.settings.start, end:data.settings.end};
        }
        CATEGORIES = mergeCategories(data.categories);
        events = Array.isArray(data.events) ? data.events : [];

        saveSettings();
        saveCategories();
        saveEvents();
        buildGrid();
        render();
        statusEl.textContent = 'importado';
      }catch(err){
        alert('No se ha podido leer el archivo. Asegúrate de que es un archivo exportado desde este planner.');
      }finally{
        importInput.value = '';
        setTimeout(showClock, 1800);
      }
    };
    reader.readAsText(file);
  });

  // ---------- INIT ----------
  applyTheme(loadTheme());
  populateHourSelects();
  loadAll();
  startClock();
})();