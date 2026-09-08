const LAYERS = [
  { n: 7, name: "Aplicación", protocols: "HTTP, FTP, SMTP, DNS", hint: "Es la capa más cercana al usuario: aquí viven las apps y protocolos que usas a diario (navegador, correo, DNS)." },
  { n: 6, name: "Presentación", protocols: "SSL/TLS, JPEG, ASCII", hint: "Traduce, cifra y comprime los datos para que el receptor pueda interpretarlos correctamente." },
  { n: 5, name: "Sesión", protocols: "NetBIOS, RPC, PPTP", hint: "Abre, mantiene y cierra la 'conversación' entre dos dispositivos durante el tiempo que dura la comunicación." },
  { n: 4, name: "Transporte", protocols: "TCP, UDP", hint: "Divide los datos en segmentos, controla errores y asegura (o no, si es UDP) que todo llegue completo y en orden." },
  { n: 3, name: "Red", protocols: "IP, ICMP, routers", hint: "Se encarga del direccionamiento lógico (IP) y de decidir la mejor ruta entre redes distintas." },
  { n: 2, name: "Enlace de datos", protocols: "Ethernet, switches, MAC", hint: "Empaqueta bits en tramas y gestiona direcciones MAC dentro de una misma red local." },
  { n: 1, name: "Física", protocols: "Cables, fibra, Wi-Fi, hubs", hint: "El nivel más bajo: bits convertidos en señales eléctricas, ópticas o de radio sobre el medio físico." },
];

const TOTAL_ROUNDS = 3;
const ROUND_TIME = 45;

let round = 1;
let score = 0;
let lives = 3;
let timeLeft = ROUND_TIME;
let timerInterval = null;
let draggedId = null;
let lastWon = false;

const studyView = document.getElementById('studyView');
const gameView = document.getElementById('gameView');
const stackStudy = document.getElementById('stackStudy');
const poolEl = document.getElementById('pool');
const slotsEl = document.getElementById('slots');
const hintEl = document.getElementById('hintText');
const overlay = document.getElementById('overlay');

/* ---------- Vista de estudio: tarjetas que se giran ---------- */
function buildStudyCards() {
  stackStudy.innerHTML = '';
  LAYERS.forEach(layer => {
    const card = document.createElement('div');
    card.className = 'flip-card';
    card.innerHTML = `
      <div class="flip-inner">
        <div class="flip-front">
          <span class="layer-tag">CAPA ${layer.n}</span>
          <h3>${layer.name}</h3>
          <span class="flip-hint">Toca para ver detalles</span>
        </div>
        <div class="flip-back">
          <p>${layer.hint}</p>
          <span class="protocols">Ejemplos: ${layer.protocols}</span>
        </div>
      </div>`;
    card.addEventListener('click', () => card.classList.toggle('flipped'));
    stackStudy.appendChild(card);
  });
}

/* ---------- Cambio de vista ---------- */
document.getElementById('startBtn').addEventListener('click', () => {
  studyView.classList.add('hidden');
  gameView.classList.remove('hidden');
  resetGame();
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

document.getElementById('backBtn').addEventListener('click', () => {
  stopTimer();
  overlay.classList.remove('show');
  gameView.classList.add('hidden');
  studyView.classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

/* ---------- Utilidades ---------- */
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ---------- Tablero del juego ---------- */
function buildBoard() {
  poolEl.innerHTML = '';
  slotsEl.innerHTML = '';

  const shuffled = shuffle(LAYERS);
  shuffled.forEach(layer => {
    const card = document.createElement('div');
    card.className = 'layer-card';
    card.draggable = true;
    card.id = 'layer-' + layer.n;
    card.dataset.n = layer.n;
    card.textContent = layer.name;
    card.addEventListener('dragstart', onDragStart);
    card.addEventListener('dragend', onDragEnd);
    card.addEventListener('click', () => showHint(layer.n));
    poolEl.appendChild(card);
  });

  for (let i = 7; i >= 1; i--) {
    const slot = document.createElement('div');
    slot.className = 'slot';
    slot.dataset.expected = i;
    slot.innerHTML = `<span class="slot-num">${i}</span><span class="slot-placeholder">Suelta una capa aquí</span>`;
    slot.addEventListener('dragover', onDragOver);
    slot.addEventListener('dragleave', onDragLeave);
    slot.addEventListener('drop', onDrop);
    slotsEl.appendChild(slot);
  }
}

function showHint(n) {
  const l = LAYERS.find(x => x.n === n);
  hintEl.innerHTML = `<strong style="color:var(--text)">${l.name}</strong><br><br>${l.hint}<br><br><span style="color:var(--magenta)">Ejemplos:</span> ${l.protocols}`;
}

function onDragStart(e) {
  draggedId = e.target.id;
  e.target.classList.add('dragging');
  e.dataTransfer.setData('text/plain', e.target.dataset.n);
  showHint(parseInt(e.target.dataset.n, 10));
}
function onDragEnd(e) { e.target.classList.remove('dragging'); }
function onDragOver(e) { e.preventDefault(); e.currentTarget.classList.add('drag-over'); }
function onDragLeave(e) { e.currentTarget.classList.remove('drag-over'); }

function onDrop(e) {
  e.preventDefault();
  const slot = e.currentTarget;
  slot.classList.remove('drag-over');
  if (slot.classList.contains('filled')) return;

  const card = document.getElementById(draggedId);
  if (!card) return;

  slot.innerHTML = `<span class="slot-num">${slot.dataset.expected}</span>`;
  card.remove();
  slot.appendChild(card);
  slot.classList.add('filled');
}

/* ---------- Comprobación ---------- */
document.getElementById('checkBtn').addEventListener('click', checkOrder);

function checkOrder() {
  const slots = document.querySelectorAll('.slot');
  let allFilled = true;
  let allCorrect = true;

  slots.forEach(slot => {
    const card = slot.querySelector('.layer-card');
    slot.classList.remove('correct', 'wrong');
    if (!card) { allFilled = false; return; }
    if (parseInt(card.dataset.n, 10) === parseInt(slot.dataset.expected, 10)) {
      slot.classList.add('correct');
    } else {
      slot.classList.add('wrong');
      allCorrect = false;
    }
  });

  if (!allFilled) {
    hintEl.innerHTML = '<span style="color:var(--amber)">Coloca las 7 capas antes de comprobar el orden.</span>';
    return;
  }

  if (allCorrect) {
    stopTimer();
    const bonus = Math.round(timeLeft * 4);
    score += 100 + bonus;
    updateHud();
    showResult(true, bonus);
  } else {
    lives--;
    updateHud();
    if (lives <= 0) {
      stopTimer();
      showResult(false);
    }
  }
}

function updateHud() {
  document.getElementById('score').textContent = score;
  document.getElementById('round').textContent = Math.min(round, TOTAL_ROUNDS);
  document.getElementById('hearts').textContent = ('♥ '.repeat(Math.max(lives, 0)) + '♡ '.repeat(3 - lives)).trim();
}

/* ---------- Temporizador ---------- */
function startTimer() {
  timeLeft = ROUND_TIME;
  const fill = document.getElementById('timerFill');
  fill.style.width = '100%';
  fill.style.background = 'var(--cyan)';
  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    timeLeft--;
    const pct = Math.max(0, (timeLeft / ROUND_TIME) * 100);
    fill.style.width = pct + '%';
    if (pct < 30) fill.style.background = 'var(--red)';
    else if (pct < 60) fill.style.background = 'var(--amber)';
    if (timeLeft <= 0) {
      clearInterval(timerInterval);
      lives--;
      updateHud();
      showResult(false, 0, lives > 0);
    }
  }, 1000);
}

function stopTimer() { clearInterval(timerInterval); }

/* ---------- Resultado de ronda ---------- */
function showResult(won, bonus = 0, timeUp = false) {
  const card = document.getElementById('resultCard');
  const title = document.getElementById('resultTitle');
  const msg = document.getElementById('resultMsg');
  const btn = document.getElementById('resultBtn');
  const scoreLine = document.getElementById('resultScore');

  card.className = 'result-card ' + (won ? 'win' : 'lose');
  lastWon = won;

  if (won) {
    title.textContent = '¡Stack completo!';
    scoreLine.textContent = '+' + (100 + bonus) + ' pts';
    msg.textContent = `Ordenaste las 7 capas correctamente. Bonus por tiempo: ${bonus} pts.`;
    btn.textContent = round >= TOTAL_ROUNDS ? 'Ver puntuación final' : 'Siguiente ronda';
  } else if (lives <= 0) {
    title.textContent = 'Te quedaste sin vidas';
    scoreLine.textContent = score + ' pts';
    msg.textContent = 'No pasa nada, el modelo OSI cuesta al principio. ¿Repetimos desde cero?';
    btn.textContent = 'Volver a intentarlo';
  } else if (timeUp) {
    title.textContent = 'Se acabó el tiempo';
    scoreLine.textContent = score + ' pts';
    msg.textContent = 'Perdiste una vida por el reloj. Sigamos con la misma ronda.';
    btn.textContent = 'Reintentar ronda';
  } else {
    title.textContent = 'Orden incorrecto';
    scoreLine.textContent = score + ' pts';
    msg.textContent = 'Alguna capa no está en su sitio. Revisa las marcadas en rojo y vuelve a intentarlo.';
    btn.textContent = 'Reintentar ronda';
  }

  overlay.classList.add('show');
}

document.getElementById('resultBtn').addEventListener('click', () => {
  overlay.classList.remove('show');
  if (lastWon) {
    if (round >= TOTAL_ROUNDS) {
      resetGame();
    } else {
      round++;
      startRound();
    }
  } else if (lives <= 0) {
    resetGame();
  } else {
    startRound();
  }
});

document.getElementById('resetRoundBtn').addEventListener('click', () => startRound());

function startRound() {
  buildBoard();
  startTimer();
  hintEl.textContent = 'Toca o arrastra una ficha para ver aquí su función y ejemplos.';
  updateHud();
}

function resetGame() {
  round = 1;
  score = 0;
  lives = 3;
  overlay.classList.remove('show');
  startRound();
}

document.getElementById('totalRounds').textContent = TOTAL_ROUNDS;
buildStudyCards();
