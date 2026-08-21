document.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('lifeCanvas');
  const ctx = canvas.getContext('2d');
  
  const genCountEl = document.getElementById('genCount');
  const popCountEl = document.getElementById('popCount');

  const playBtn = document.getElementById('playBtn');
  const stepBtn = document.getElementById('stepBtn');
  const randomBtn = document.getElementById('randomBtn');
  const clearBtn = document.getElementById('clearBtn');

  const cols = 35;
  const rows = 35;
  const cellWidth = canvas.width / cols;
  const cellHeight = canvas.height / rows;

  let grid = createGrid();
  let isRunning = false;
  let generation = 0;
  let timer = null;

  // Control para pintar arrastrando el ratón
  let isMouseDown = false;
  let drawMode = 1; // 1 = Pintar célula viva, 0 = Borrar

  const COLOR_BG = 'rgb(32, 16, 38)';
  const COLOR_GRID = 'rgb(15, 6, 18)';
  const COLOR_ALIVE = 'rgb(0, 255, 0)';

  function createGrid() {
    return Array.from({ length: cols }, () => new Array(rows).fill(0));
  }

  function randomizeGrid() {
    grid = Array.from({ length: cols }, () =>
      Array.from({ length: rows }, () => (Math.random() > 0.5 ? 1 : 0))
    );
    generation = 0;
    draw();
  }

  function draw() {
    ctx.fillStyle = COLOR_BG;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    let population = 0;

    for (let x = 0; x < cols; x++) {
      for (let y = 0; y < rows; y++) {
        const px = x * cellWidth;
        const py = y * cellHeight;

        if (grid[x][y] === 1) {
          population++;
          ctx.fillStyle = COLOR_ALIVE;
          ctx.fillRect(px, py, cellWidth, cellHeight);
        } else {
          ctx.strokeStyle = COLOR_GRID;
          ctx.lineWidth = 1;
          ctx.strokeRect(px, py, cellWidth, cellHeight);
        }
      }
    }

    genCountEl.textContent = generation;
    popCountEl.textContent = population;
  }

  function update() {
    const nextGrid = createGrid();

    for (let x = 0; x < cols; x++) {
      for (let y = 0; y < rows; y++) {
        let neighbors = 0;
        for (let i = -1; i <= 1; i++) {
          for (let j = -1; j <= 1; j++) {
            if (i === 0 && j === 0) continue;
            const nx = (x + i + cols) % cols;
            const ny = (y + j + rows) % rows;
            neighbors += grid[nx][ny];
          }
        }

        if (grid[x][y] === 0 && neighbors === 3) {
          nextGrid[x][y] = 1;
        } else if (grid[x][y] === 1 && (neighbors < 2 || neighbors > 3)) {
          nextGrid[x][y] = 0;
        } else {
          nextGrid[x][y] = grid[x][y];
        }
      }
    }

    grid = nextGrid;
    generation++;
    draw();
  }

  function togglePlay() {
    isRunning = !isRunning;
    if (isRunning) {
      playBtn.textContent = '⏸️ Pausar';
      playBtn.classList.remove('primary');
      timer = setInterval(update, 200);
    } else {
      playBtn.textContent = '▶️ Iniciar';
      playBtn.classList.add('primary');
      clearInterval(timer);
    }
  }

  // Obtener coordenadas de la celda según el evento
  function getCellCoords(e) {
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const x = Math.floor(((clientX - rect.left) * scaleX) / cellWidth);
    const y = Math.floor(((clientY - rect.top) * scaleY) / cellHeight);

    return { x, y };
  }

  function handlePaintStart(e) {
    const { x, y } = getCellCoords(e);
    if (x >= 0 && x < cols && y >= 0 && y < rows) {
      isMouseDown = true;
      // Si la celda estaba vacía pintamos (1), si estaba viva borramos (0)
      drawMode = grid[x][y] === 1 ? 0 : 1;
      grid[x][y] = drawMode;
      draw();
    }
  }

  function handlePaintMove(e) {
    if (!isMouseDown) return;
    const { x, y } = getCellCoords(e);
    if (x >= 0 && x < cols && y >= 0 && y < rows) {
      if (grid[x][y] !== drawMode) {
        grid[x][y] = drawMode;
        draw();
      }
    }
  }

  function handlePaintEnd() {
    isMouseDown = false;
  }

  // Eventos de ratón y táctil para pintar/borrar arrastrando
  canvas.addEventListener('mousedown', handlePaintStart);
  canvas.addEventListener('mousemove', handlePaintMove);
  window.addEventListener('mouseup', handlePaintEnd);

  canvas.addEventListener('touchstart', (e) => { handlePaintStart(e); e.preventDefault(); }, { passive: false });
  canvas.addEventListener('touchmove', (e) => { handlePaintMove(e); e.preventDefault(); }, { passive: false });
  window.addEventListener('touchend', handlePaintEnd);

  // Botones de la barra de herramientas
  playBtn.addEventListener('click', togglePlay);
  stepBtn.addEventListener('click', () => { if (!isRunning) update(); });
  randomBtn.addEventListener('click', () => { if (!isRunning) randomizeGrid(); });
  clearBtn.addEventListener('click', () => {
    if (isRunning) togglePlay();
    grid = createGrid();
    generation = 0;
    draw();
  });

  // Estado inicial aleatorio
  randomizeGrid();
});