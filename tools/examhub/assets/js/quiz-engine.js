(function () {
  "use strict";

  function escapeHtml(s) {
    return (s || "").replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function shortCode(name) {
    var words = name.replace(/[()]/g, "").split(/\s+/).filter(Boolean);
    if (words.length === 1) return words[0].slice(0, 6).toUpperCase();
    return words.slice(0, 2).map(function (w) { return w.slice(0, 3); }).join("-").toUpperCase();
  }

  var config = null;
  try {
    config = JSON.parse(sessionStorage.getItem("examConfig"));
  } catch (e) {}

  if (!config || !config.temas || config.temas.length === 0) {
    document.getElementById("loadError").style.display = "block";
    document.getElementById("loadError").innerHTML =
      'No hay ninguna sesión configurada. <a href="index.html" style="color:var(--cyan)">Vuelve al catálogo</a> y elige qué quieres practicar.';
  } else {
    boot();
  }

  function boot() {
    document.getElementById("sessionSubtitle").textContent =
      config.temas.length + " tema(s) · " + config.numTest + " test · " + config.numRed + " redacción";

    Promise.all(
      config.temas.map(function (t) {
        return fetch(t.file)
          .then(function (r) {
            if (!r.ok) throw new Error(t.file + ": HTTP " + r.status);
            return r.json();
          })
          .then(function (data) {
            return { meta: t, data: data };
          });
      })
    )
      .then(function (files) {
        resolveLocked(files);
      })
      .catch(function (err) {
        document.getElementById("loadError").style.display = "block";
        document.getElementById("loadError").textContent =
          "No se pudieron cargar los archivos de preguntas (" + err.message + ").";
      });
  }

  /* ---------- temas cifrados: pedir contraseña y descifrar en el navegador ---------- */
  var lockModal = document.getElementById("lockModal");
  var lockInput = document.getElementById("lockPasswordInput");
  var lockError = document.getElementById("lockModalError");
  var lockDesc = document.getElementById("lockModalDesc");
  var lockSubmitBtn = document.getElementById("lockSubmitBtn");
  var lockCancelBtn = document.getElementById("lockCancelBtn");

  function resolveLocked(files) {
    var pending = files.filter(function (f) { return f.data && f.data.encrypted; });
    if (pending.length === 0) {
      startSession(files);
      return;
    }
    var asignaturasBloqueadas = Array.from(new Set(pending.map(function (f) { return f.meta.asignatura; })));
    lockDesc.textContent =
      (asignaturasBloqueadas.length === 1 ? "«" + asignaturasBloqueadas[0] + "»" : "Algunos temas") +
      " está protegido con contraseña. Introdúcela para descifrarlo en tu navegador (no se envía a ningún sitio).";
    lockError.style.display = "none";
    lockInput.value = "";
    lockModal.style.display = "flex";
    lockInput.focus();

    async function intentar() {
      var password = lockInput.value;
      if (!password) return;
      lockSubmitBtn.disabled = true;
      lockSubmitBtn.textContent = "Descifrando…";
      var siguientesPendientes = [];
      for (var i = 0; i < pending.length; i++) {
        var f = pending[i];
        try {
          var decrypted = await window.CryptoLock.decryptTema(f.data, password);
          f.data.test = decrypted.test;
          f.data.redaccion = decrypted.redaccion;
          f.data.encrypted = false;
        } catch (e) {
          siguientesPendientes.push(f);
        }
      }
      lockSubmitBtn.disabled = false;
      lockSubmitBtn.textContent = "Desbloquear";

      if (siguientesPendientes.length === 0) {
        lockModal.style.display = "none";
        startSession(files);
        return;
      }
      pending = siguientesPendientes;
      lockError.style.display = "block";
      var nombres = Array.from(new Set(pending.map(function (f) { return f.meta.asignatura; })));
      lockError.textContent = "Contraseña incorrecta para: " + nombres.join(", ") + ". Inténtalo de nuevo.";
      lockInput.value = "";
      lockInput.focus();
    }

    lockSubmitBtn.onclick = intentar;
    lockInput.onkeydown = function (e) {
      if (e.key === "Enter") intentar();
    };
    lockCancelBtn.onclick = function () {
      window.location.href = "index.html";
    };
  }

  /* ---------- pool construction ---------- */
  function buildPools(files) {
    var testPool = [];
    var redPool = [];

    files.forEach(function (f) {
      var meta = f.meta;
      var data = f.data;
      (data.test || []).forEach(function (q, idx) {
        var correctIdx = (q.opciones || [])
          .map(function (o, i) { return o.correcta ? i : -1; })
          .filter(function (i) { return i > -1; });
        var tipo = q.tipo === "matching_table" || q.tipo === "matching_image" ? q.tipo : correctIdx.length > 1 ? "multi" : "single";
        testPool.push({
          qid: meta.file + "#t" + idx,
          asignatura: meta.asignatura,
          asignatura_slug: meta.asignatura_slug,
          tema_nombre: meta.nombre,
          tema_code: shortCode(meta.nombre),
          enunciado: q.enunciado,
          opciones: (q.opciones || []).map(function (o) { return o.texto; }),
          correct_indices: correctIdx,
          tipo: tipo,
          imagenes: q.imagenes || [],
          tabla: q.tabla || [],
          explicacion: q.explicacion || "",
        });
      });
      (data.redaccion || []).forEach(function (q, idx) {
        redPool.push({
          qid: meta.file + "#r" + idx,
          asignatura: meta.asignatura,
          asignatura_slug: meta.asignatura_slug,
          tema_nombre: meta.nombre,
          tema_code: shortCode(meta.nombre),
          titulo: q.titulo,
          enunciado: q.enunciado,
          puntos: q.puntos || 10,
        });
      });
    });

    if (config.onlyFailed) {
      var stats = window.ExamStorage.all();
      testPool = testPool.filter(function (q) {
        var s = stats[q.qid];
        return s && s.lastWrong;
      });
    }

    if (config.order === "random") {
      testPool = shuffle(testPool);
      redPool = shuffle(redPool);
    }

    testPool = testPool.slice(0, config.numTest);
    redPool = redPool.slice(0, config.numRed);
    return { testPool: testPool, redPool: redPool };
  }

  /* ---------- session state ---------- */
  var session = null;

  function startSession(files, customPools) {
    var pools = customPools || buildPools(files);
    session = {
      files: files,
      test: pools.testPool,
      red: pools.redPool,
      index: 0,
      answers: {},
      flags: {},
      drafts: {},
      startTime: Date.now(),
      mode: customPools ? "practice" : config.mode,
    };
    session.total = session.test.length + session.red.length;

    document.getElementById("ticketTotal").textContent = String(session.total).padStart(3, "0");
    document.getElementById("view-results").style.display = "none";
    document.getElementById("view-session").style.display = "block";
    buildTrail();
    renderCurrent();
  }

  function currentItem() {
    if (session.index < session.test.length) return { kind: "test", q: session.test[session.index] };
    return { kind: "red", q: session.red[session.index - session.test.length] };
  }

  function itemAt(i) {
    return i < session.test.length ? session.test[i] : session.red[i - session.test.length];
  }

  /* estado de una pregunta por índice: unanswered | st-skipped | done-correct | done-wrong */
  function stateClassAt(i) {
    var q = itemAt(i);
    var a = session.answers[q.qid];
    if (!a) return "";
    if (a.skipped) return "st-skipped";
    if (i < session.test.length) return a.correct ? "done-correct" : "done-wrong";
    return "done-correct"; // redacción guardada / matching revelado cuenta como completada
  }

  function buildTrail() {
    var trail = document.getElementById("trail");
    trail.innerHTML = "";
    for (var i = 0; i < session.total; i++) {
      var dot = document.createElement("i");
      (function (idx) {
        dot.addEventListener("click", function () { goTo(idx); });
      })(i);
      trail.appendChild(dot);
    }
    buildPalette();
    updateTrail();
  }

  function updateTrail() {
    var children = document.getElementById("trail").children;
    for (var i = 0; i < session.total; i++) {
      var el = children[i];
      el.className = stateClassAt(i);
      if (i === session.index) el.classList.add("current");
      if (session.flags[itemAt(i).qid]) el.classList.add("flagged");
    }
    updatePalette();
    updateFlagsBadge();
    updateNavButtons();
  }

  /* ---------- panel paleta ---------- */
  var elPalettePanel = document.getElementById("palettePanel");
  var elPaletteGrid = document.getElementById("paletteGrid");
  var elPaletteBtn = document.getElementById("paletteBtn");

  function buildPalette() {
    elPaletteGrid.innerHTML = "";
    for (var i = 0; i < session.total; i++) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "palette-item";
      btn.textContent = String(i + 1);
      (function (idx) {
        btn.addEventListener("click", function () {
          goTo(idx);
          elPalettePanel.style.display = "none";
        });
      })(i);
      elPaletteGrid.appendChild(btn);
    }
  }

  function updatePalette() {
    var children = elPaletteGrid.children;
    for (var i = 0; i < session.total; i++) {
      var el = children[i];
      el.className = "palette-item " + stateClassAt(i);
      if (i === session.index) el.classList.add("current");
      if (session.flags[itemAt(i).qid]) el.classList.add("flagged");
    }
  }

  elPaletteBtn.addEventListener("click", function () {
    var show = elPalettePanel.style.display === "none";
    elPalettePanel.style.display = show ? "block" : "none";
  });

  /* ---------- navegación libre (no obliga a responder) ---------- */
  var elPrevBtn = document.getElementById("prevBtn");
  var elNextBtn = document.getElementById("nextBtn");

  function goTo(index) {
    if (index < 0 || index >= session.total) return;
    session.index = index;
    renderCurrent();
  }

  function updateNavButtons() {
    elPrevBtn.disabled = session.index === 0;
    elNextBtn.textContent = session.index === session.total - 1 ? "Finalizar ›" : "Siguiente ›";
  }

  elPrevBtn.addEventListener("click", function () { goTo(session.index - 1); });
  elNextBtn.addEventListener("click", function () {
    if (session.index === session.total - 1) {
      finishSession();
    } else {
      goTo(session.index + 1);
    }
  });

  /* ---------- acceso rápido a marcadas ---------- */
  var elFlagsNavBtn = document.getElementById("flagsNavBtn");
  var elFlagsBadge = document.getElementById("flagsBadge");

  function flaggedIndices() {
    var out = [];
    for (var i = 0; i < session.total; i++) {
      if (session.flags[itemAt(i).qid]) out.push(i);
    }
    return out;
  }

  function updateFlagsBadge() {
    var flagged = flaggedIndices();
    elFlagsNavBtn.style.display = flagged.length ? "flex" : "none";
    elFlagsBadge.textContent = String(flagged.length);
  }

  elFlagsNavBtn.addEventListener("click", function () {
    var flagged = flaggedIndices();
    if (flagged.length === 0) return;
    var next = flagged.find(function (i) { return i > session.index; });
    goTo(next !== undefined ? next : flagged[0]);
  });

  /* ---------- element refs ---------- */
  var elQTags = document.getElementById("qTags");
  var elQText = document.getElementById("qText");
  var elQImages = document.getElementById("qImages");
  var elOptions = document.getElementById("options");
  var elMatchArea = document.getElementById("matchArea");
  var elRedArea = document.getElementById("redaccionArea");
  var elFeedback = document.getElementById("feedback");
  var elFeedbackHead = document.getElementById("feedbackHead");
  var elFeedbackBody = document.getElementById("feedbackBody");
  var elCheckBtn = document.getElementById("checkBtn");
  var elSkipBtn = document.getElementById("skipBtn");
  var elMultiHint = document.getElementById("multiHint");
  var elFlagBtn = document.getElementById("flagBtn");

  var currentSelection = [];
  var currentMatch = null;
  var locked = false;

  function renderCurrent() {
    var item = currentItem();
    currentSelection = [];
    currentMatch = null;
    locked = false;

    document.getElementById("ticketNum").textContent = String(session.index + 1).padStart(3, "0");
    updateTrail();
    elFlagBtn.classList.toggle("flagged", !!session.flags[item.q.qid]);

    elMatchArea.innerHTML = "";
    elRedArea.innerHTML = "";
    elOptions.innerHTML = "";
    elQImages.innerHTML = "";
    elFeedback.classList.remove("show", "ok", "bad");
    elMultiHint.textContent = "";

    if (item.kind === "test") renderTestQuestion(item.q);
    else renderRedQuestion(item.q);

    if (session.answers[item.q.qid]) showAnswered(item);
  }

  function tagsHtml(q, extra) {
    var html =
      '<span class="tag cat">' + escapeHtml(q.asignatura) + "</span>" +
      '<span class="tag">' + escapeHtml(q.tema_nombre) + "</span>";
    return html + (extra || "");
  }

  function renderTestQuestion(q) {
    var extra = "";
    if (q.tipo === "multi") extra += '<span class="tag type-multi">Varias respuestas</span>';
    if (q.tipo === "matching_table" || q.tipo === "matching_image") extra += '<span class="tag type-match">Emparejar</span>';
    elQTags.innerHTML = tagsHtml(q, extra);
    elQText.textContent = q.enunciado;

    var interactive = (q.tipo === "matching_table" || q.tipo === "matching_image") && q.tabla && q.tabla.length > 0;
    var legacyImageMatch = q.tipo === "matching_image" && !interactive;

    // Las preguntas ya migradas a tabla interactiva no muestran imagen: la
    // tabla la sustituye por completo (algunas matching_table conservan un
    // campo "imagenes" heredado de antes de migrar, que ya no debe pintarse).
    var visibleImages = interactive ? [] : (q.tipo === "matching_image" ? q.imagenes.slice(0, 1) : q.imagenes);
    visibleImages.forEach(function (src) {
      var img = document.createElement("img");
      img.src = src;
      img.loading = "lazy";
      img.addEventListener("click", function () { openLightbox(src); });
      elQImages.appendChild(img);
    });

    if (interactive) renderMatchingInteractive(q);
    else if (q.tipo === "matching_table") renderMatchingTable(q);
    else if (q.tipo === "matching_image") renderMatchingImage(q);
    else renderChoiceOptions(q);

    elCheckBtn.style.display = "inline-flex";
    if (interactive) {
      elCheckBtn.textContent = "Comprobar emparejamiento";
      elCheckBtn.disabled = true;
    } else if (legacyImageMatch) {
      elCheckBtn.textContent = "Siguiente pregunta";
      elCheckBtn.disabled = true;
    } else if (q.tipo === "matching_table") {
      elCheckBtn.textContent = "Verificar emparejamiento";
      elCheckBtn.disabled = true;
    } else {
      elCheckBtn.textContent = "Verificar respuesta";
      elCheckBtn.disabled = false;
    }
    elSkipBtn.style.display = "inline-block";
  }

  function renderChoiceOptions(q) {
    if (q.tipo === "multi") {
      var n = q.correct_indices.length;
      elMultiHint.textContent = "Elige " + n + " opción" + (n > 1 ? "es" : "");
    }
    var draft = session.drafts[q.qid] || [];
    currentSelection = draft.slice();
    q.opciones.forEach(function (opt, idx) {
      var row = document.createElement("div");
      row.className = "option " + (q.tipo === "multi" ? "checkbox" : "radio");
      row.dataset.idx = idx;
      row.innerHTML =
        '<span class="mark">' +
        (q.tipo === "multi"
          ? '<svg viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="#052420" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>'
          : "<i></i>") +
        '</span><span class="option-text">' + escapeHtml(opt) + "</span>";
      if (draft.indexOf(idx) > -1) row.classList.add("selected");
      row.addEventListener("click", function () {
        if (locked) return;
        if (q.tipo === "multi") {
          var pos = currentSelection.indexOf(idx);
          if (pos > -1) currentSelection.splice(pos, 1);
          else currentSelection.push(idx);
          row.classList.toggle("selected");
        } else {
          currentSelection = [idx];
          Array.prototype.forEach.call(elOptions.children, function (r) { r.classList.remove("selected"); });
          row.classList.add("selected");
        }
        session.drafts[q.qid] = currentSelection.slice();
      });
      elOptions.appendChild(row);
    });
  }

  function markAnsweredCorrectByReveal(q) {
    if (!session.answers[q.qid]) {
      session.answers[q.qid] = { selected: [], correct: true, skipped: false };
      window.ExamStorage.record(q.qid, true);
      updateTrail();
    }
    locked = true;
    elCheckBtn.disabled = false;
    elCheckBtn.textContent = session.index === session.total - 1 ? "Ver informe final" : "Siguiente pregunta";
    elSkipBtn.style.display = "none";
    showExplanation(q.explicacion, true);
  }

  function renderMatchingImage(q) {
    var wrap = document.createElement("div");
    var btn = document.createElement("button");
    btn.className = "reveal-btn";
    btn.textContent = "Mostrar respuesta";
    wrap.appendChild(btn);
    var answerWrap = document.createElement("div");
    answerWrap.className = "q-images";
    answerWrap.style.marginTop = "14px";
    answerWrap.style.display = "none";
    wrap.appendChild(answerWrap);

    var answerImages = q.imagenes.slice(1);
    if (answerImages.length === 0) answerImages = q.imagenes.slice(0, 1);
    answerImages.forEach(function (src) {
      var img = document.createElement("img");
      img.loading = "lazy";
      img.src = src;
      img.addEventListener("click", function () { openLightbox(src); });
      answerWrap.appendChild(img);
    });

    btn.addEventListener("click", function () {
      btn.style.display = "none";
      answerWrap.style.display = "flex";
      markAnsweredCorrectByReveal(q);
    });
    elMatchArea.appendChild(wrap);
  }

  /* ---------- emparejar interactivo ---------- */
  function renderMatchingInteractive(q) {
    var pairs = q.tabla;
    var n = pairs.length; // términos reales, los únicos que hay que emparejar y se corrigen
    var decoys = q.senuelos || []; // señuelos del lado de la definición (derecha)
    var decoyTerms = q.senuelos_terminos || []; // señuelos del lado del término (izquierda): sin respuesta correcta
    var poolSize = n + decoys.length;
    var totalTerms = n + decoyTerms.length;
    var answered = session.answers[q.qid];

    // Si ya está corregida, mostramos directamente la revisión clara en vez
    // de reconstruir las fichas clicables.
    if (answered && !answered.skipped && answered.pairing) {
      renderMatchReview(q, answered);
      currentMatch = null;
      return;
    }

    var defOrder;
    if (answered && answered.defOrder) {
      defOrder = answered.defOrder;
    } else {
      if (!session.drafts[q.qid]) session.drafts[q.qid] = {};
      if (!session.drafts[q.qid].defOrder) {
        var poolIdxs = [];
        for (var i = 0; i < poolSize; i++) poolIdxs.push(i);
        session.drafts[q.qid].defOrder = shuffle(poolIdxs);
      }
      defOrder = session.drafts[q.qid].defOrder;
    }
    var draftPairing = (!answered && session.drafts[q.qid] && session.drafts[q.qid].pairing) || {};

    // Texto de un elemento del pool de definiciones: índices < n son
    // definiciones reales; índices >= n son señuelos sin término.
    function poolText(poolIdx) {
      return poolIdx < n ? pairs[poolIdx][1] : decoys[poolIdx - n];
    }

    var wrap = document.createElement("div");
    var hint = document.createElement("p");
    hint.className = "match-instructions";
    hint.textContent = "Toca un término y luego su definición para emparejarlos. Vuelve a tocar para deshacer.";
    wrap.appendChild(hint);

    var area = document.createElement("div");
    area.className = "match-interactive";
    var termsCol = document.createElement("div");
    termsCol.className = "match-col match-terms";
    var defsCol = document.createElement("div");
    defsCol.className = "match-col match-defs";

    var termEls = [], defEls = [];
    var pairing = {};
    var selectedTerm = null;

    pairs.forEach(function (pair, i) {
      var el = document.createElement("button");
      el.type = "button";
      el.className = "match-chip match-term";
      el.textContent = (i + 1) + ". " + pair[0];
      termsCol.appendChild(el);
      termEls.push(el);
    });
    // Señuelos de término: se muestran mezclados igual que cualquier otro,
    // sin marca visual — si no, dejarían de ser un señuelo.
    decoyTerms.forEach(function (text, j) {
      var i = n + j;
      var el = document.createElement("button");
      el.type = "button";
      el.className = "match-chip match-term";
      el.textContent = (i + 1) + ". " + text;
      termsCol.appendChild(el);
      termEls.push(el);
    });

    defOrder.forEach(function (poolIdx, slot) {
      var el = document.createElement("button");
      el.type = "button";
      el.className = "match-chip match-def";
      el.textContent = String.fromCharCode(65 + slot) + ". " + poolText(poolIdx);
      defsCol.appendChild(el);
      defEls.push(el);
    });

    area.appendChild(termsCol);
    area.appendChild(defsCol);
    wrap.appendChild(area);
    elMatchArea.appendChild(wrap);

    function hue(termIdx) { return (termIdx * 67) % 360; }

    function updateHint() {
      // Solo los términos reales (0..n-1) cuentan para poder verificar; los
      // señuelos de término son opcionales, emparejarlos o no da igual.
      var count = 0;
      for (var i = 0; i < n; i++) if (pairing[i] !== undefined) count++;
      elMultiHint.textContent = count < n ? "Empareja los " + n + " términos (" + count + "/" + n + ")" : "";
      elCheckBtn.disabled = count < n;
    }

    function link(termIdx, slot) {
      unlinkTerm(termIdx);
      unlinkSlot(slot);
      pairing[termIdx] = slot;
      termEls[termIdx].style.setProperty("--pair-hue", hue(termIdx));
      defEls[slot].style.setProperty("--pair-hue", hue(termIdx));
      termEls[termIdx].classList.add("paired");
      defEls[slot].classList.add("paired");
      session.drafts[q.qid].pairing = pairing;
      updateHint();
    }

    function unlinkTerm(termIdx) {
      var slot = pairing[termIdx];
      if (slot === undefined) return;
      termEls[termIdx].classList.remove("paired");
      defEls[slot].classList.remove("paired");
      delete pairing[termIdx];
      if (session.drafts[q.qid]) session.drafts[q.qid].pairing = pairing;
    }

    function unlinkSlot(slot) {
      var found = Object.keys(pairing).filter(function (k) { return pairing[k] === slot; })[0];
      if (found !== undefined) unlinkTerm(parseInt(found, 10));
    }

    termEls.forEach(function (el, termIdx) {
      el.addEventListener("click", function () {
        if (locked) return;
        if (selectedTerm === termIdx) { selectedTerm = null; el.classList.remove("active"); return; }
        if (el.classList.contains("paired")) { unlinkTerm(termIdx); el.classList.remove("active"); selectedTerm = null; updateHint(); return; }
        if (selectedTerm !== null) termEls[selectedTerm].classList.remove("active");
        selectedTerm = termIdx;
        el.classList.add("active");
      });
    });

    defEls.forEach(function (el, slot) {
      el.addEventListener("click", function () {
        if (locked) return;
        if (el.classList.contains("paired")) {
          var found = Object.keys(pairing).filter(function (k) { return pairing[k] === slot; })[0];
          unlinkSlot(slot);
          if (found !== undefined && selectedTerm === parseInt(found, 10)) selectedTerm = null;
          updateHint();
          return;
        }
        if (selectedTerm === null) return;
        var t = selectedTerm;
        termEls[t].classList.remove("active");
        selectedTerm = null;
        link(t, slot);
      });
    });

    Object.keys(draftPairing).forEach(function (termIdx) {
      link(parseInt(termIdx, 10), draftPairing[termIdx]);
    });
    updateHint();

    currentMatch = { q: q, n: n, pairs: pairs, poolText: poolText, defOrder: defOrder, pairing: pairing, termEls: termEls, defEls: defEls };
  }

  // Lista de revisión clara: un término por fila, con tu respuesta y,
  // si fallaste, la respuesta correcta debajo. Sustituye el coloreado de
  // fichas (que hacía perder de vista qué iba emparejado con qué).
  // La corrección compara por TEXTO (no por posición): así, si dos términos
  // comparten la misma definición correcta (p. ej. dos características que
  // son "tcp"), emparejar con cualquiera de las dos casillas cuenta como
  // acierto. Los señuelos de término (sin tabla) no se listan aquí: no
  // tienen respuesta correcta posible, así que no se corrigen.
  function renderMatchReview(q, a) {
    var pairs = q.tabla;
    var decoys = q.senuelos || [];
    var n = pairs.length;
    var defOrder = a.defOrder || pairs.map(function (_, i) { return i; });

    function poolText(poolIdx) {
      return poolIdx < n ? pairs[poolIdx][1] : decoys[poolIdx - n];
    }

    elMatchArea.innerHTML = "";
    var wrap = document.createElement("div");
    wrap.className = "match-review";

    pairs.forEach(function (pair, termIdx) {
      var slot = a.pairing ? a.pairing[termIdx] : undefined;
      var yourPoolIdx = (slot !== undefined && slot !== null) ? defOrder[slot] : undefined;
      var ok = yourPoolIdx !== undefined && poolText(yourPoolIdx) === pair[1];

      var row = document.createElement("div");
      row.className = "match-review-row " + (ok ? "correct" : "wrong");

      var head = document.createElement("div");
      head.className = "mr-term";
      var icon = ok
        ? '<svg viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>'
        : '<svg viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>';
      head.innerHTML = '<span class="mr-icon">' + icon + "</span>" + escapeHtml(pair[0]);
      row.appendChild(head);

      var yourAns = document.createElement("div");
      yourAns.className = "mr-line mr-your";
      yourAns.innerHTML = '<b>Tu respuesta:</b> ' + escapeHtml(yourPoolIdx !== undefined ? poolText(yourPoolIdx) : "— sin respuesta —");
      row.appendChild(yourAns);

      if (!ok) {
        var correctAns = document.createElement("div");
        correctAns.className = "mr-line mr-correct";
        correctAns.innerHTML = '<b>Correcta:</b> ' + escapeHtml(pair[1]);
        row.appendChild(correctAns);
      }

      wrap.appendChild(row);
    });

    elMatchArea.appendChild(wrap);
  }

  function evaluateMatching() {
    var cm = currentMatch;
    if (!cm) return;
    locked = true;
    var pairing = {};
    var allOk = true;
    // Solo se corrigen los términos reales (0..n-1). Los señuelos de
    // término, si el usuario los emparejó por curiosidad, se guardan pero
    // no afectan a la nota.
    for (var termIdx = 0; termIdx < cm.n; termIdx++) {
      var slot = cm.pairing[termIdx];
      pairing[termIdx] = slot;
      var ok = slot !== undefined && cm.poolText(cm.defOrder[slot]) === cm.pairs[termIdx][1];
      if (!ok) allOk = false;
    }
    Object.keys(cm.pairing).forEach(function (k) {
      var idx = parseInt(k, 10);
      if (idx >= cm.n) pairing[idx] = cm.pairing[idx];
    });

    var answer = { pairing: pairing, defOrder: cm.defOrder, correct: allOk, skipped: false };
    session.answers[cm.q.qid] = answer;
    window.ExamStorage.record(cm.q.qid, allOk);
    updateTrail();
    elMultiHint.textContent = "";

    renderMatchReview(cm.q, answer);
    currentMatch = null;

    if (session.mode === "practice") showExplanation(cm.q.explicacion, allOk);
    elCheckBtn.textContent = session.index === session.total - 1 ? "Ver informe final" : "Siguiente pregunta";
    elSkipBtn.style.display = "none";
  }

  function renderMatchingTable(q) {
    var wrap = document.createElement("div");
    var btn = document.createElement("button");
    btn.className = "reveal-btn";
    btn.textContent = "Mostrar respuesta";
    wrap.appendChild(btn);

    var tbl = document.createElement("table");
    tbl.className = "match-table";
    tbl.style.display = "none";
    tbl.style.marginTop = "14px";
    var tbody = document.createElement("tbody");
    (q.tabla || []).forEach(function (row) {
      var tr = document.createElement("tr");
      row.forEach(function (cell) {
        var td = document.createElement("td");
        td.textContent = cell;
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    tbl.appendChild(tbody);
    wrap.appendChild(tbl);

    btn.addEventListener("click", function () {
      btn.style.display = "none";
      tbl.style.display = "table";
      markAnsweredCorrectByReveal(q);
    });
    elMatchArea.appendChild(wrap);
  }

  function showExplanation(text, ok) {
    elFeedback.classList.add("show", ok ? "ok" : "bad");
    elFeedback.classList.remove(ok ? "bad" : "ok");
    elFeedbackHead.innerHTML = ok
      ? '<svg viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg> Correcto'
      : '<svg viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg> Incorrecto';
    elFeedbackBody.textContent = text || "Sin explicación disponible para esta pregunta.";
  }

  /* ---------- redacción ---------- */
  function renderRedQuestion(q) {
    elQTags.innerHTML = tagsHtml(q, '<span class="tag type-red">Redacción · ' + q.puntos + ' pts</span>');
    elQText.textContent = q.titulo ? q.titulo + "\n" + q.enunciado : q.enunciado;

    var textarea = document.createElement("textarea");
    textarea.className = "redaccion-box";
    textarea.placeholder = "Escribe tu respuesta aquí…";
    textarea.id = "redInput";
    textarea.value = session.drafts[q.qid] || "";
    textarea.addEventListener("input", function () {
      session.drafts[q.qid] = textarea.value;
    });
    elRedArea.appendChild(textarea);
    var hint = document.createElement("div");
    hint.className = "redaccion-points";
    hint.textContent = "Se corrige a mano — al terminar la sesión podrás descargar un bloque con todas tus respuestas.";
    elRedArea.appendChild(hint);

    elCheckBtn.style.display = "inline-flex";
    elCheckBtn.textContent = session.index === session.total - 1 ? "Guardar y ver informe" : "Guardar y continuar";
    elCheckBtn.disabled = false;
    elSkipBtn.style.display = "inline-block";
  }

  /* ---------- check / skip / next ---------- */
  elCheckBtn.addEventListener("click", function () {
    var item = currentItem();
    if (item.kind === "red") {
      if (locked) { goNext(); return; }
      var text = document.getElementById("redInput").value;
      session.answers[item.q.qid] = { text: text, skipped: false };
      locked = true;
      updateTrail();
      goNext();
      return;
    }
    if (locked) { goNext(); return; }
    if (item.q.tipo === "matching_table" || item.q.tipo === "matching_image") {
      if (currentMatch) { evaluateMatching(); return; }
      return; // legacy: se gestiona en el botón de revelar
    }
    if (currentSelection.length === 0) return;
    evaluateAnswer(item.q);
  });

  function evaluateAnswer(q) {
    locked = true;
    var correctSet = q.correct_indices.slice().sort();
    var selSet = currentSelection.slice().sort();
    var ok = correctSet.length === selSet.length && correctSet.every(function (v, i) { return v === selSet[i]; });

    Array.prototype.forEach.call(elOptions.children, function (row) {
      var idx = parseInt(row.dataset.idx, 10);
      var isCorrect = q.correct_indices.indexOf(idx) > -1;
      var isSelected = currentSelection.indexOf(idx) > -1;
      if (isCorrect && isSelected) row.classList.add("correct");
      else if (isCorrect && !isSelected) row.classList.add("missed");
      else if (!isCorrect && isSelected) row.classList.add("wrong");
      row.classList.add("locked");
    });

    session.answers[q.qid] = { selected: currentSelection.slice(), correct: ok, skipped: false };
    window.ExamStorage.record(q.qid, ok);
    updateTrail();

    if (session.mode === "practice") showExplanation(q.explicacion, ok);
    elCheckBtn.textContent = session.index === session.total - 1 ? "Ver informe final" : "Siguiente pregunta";
    elSkipBtn.style.display = "none";
  }

  function showAnswered(item) {
    var a = session.answers[item.q.qid];
    if (!a || a.skipped) return;
    locked = true;
    if (item.kind === "red") {
      document.getElementById("redInput").value = a.text || "";
      elCheckBtn.textContent = session.index === session.total - 1 ? "Guardar y ver informe" : "Guardar y continuar";
      elSkipBtn.style.display = "none";
      return;
    }
    if (item.q.tipo === "matching_table" || item.q.tipo === "matching_image") {
      // La revisión (lista término/respuesta/correcta) ya se pinta dentro
      // de renderMatchingInteractive cuando detecta que hay respuesta guardada.
      if (session.mode === "practice") showExplanation(item.q.explicacion, a.correct);
      elCheckBtn.textContent = session.index === session.total - 1 ? "Ver informe final" : "Siguiente pregunta";
      elCheckBtn.disabled = false;
      elSkipBtn.style.display = "none";
      return;
    }
    if (item.q.tipo !== "matching_table" && item.q.tipo !== "matching_image") {
      Array.prototype.forEach.call(elOptions.children, function (row) {
        var idx = parseInt(row.dataset.idx, 10);
        var isCorrect = item.q.correct_indices.indexOf(idx) > -1;
        var isSelected = a.selected.indexOf(idx) > -1;
        if (isSelected) row.classList.add("selected");
        if (isCorrect && isSelected) row.classList.add("correct");
        else if (isCorrect && !isSelected) row.classList.add("missed");
        else if (!isCorrect && isSelected) row.classList.add("wrong");
        row.classList.add("locked");
      });
      if (session.mode === "practice") showExplanation(item.q.explicacion, a.correct);
      elCheckBtn.textContent = session.index === session.total - 1 ? "Ver informe final" : "Siguiente pregunta";
    }
    elSkipBtn.style.display = "none";
  }

  elSkipBtn.addEventListener("click", function () {
    var item = currentItem();
    session.answers[item.q.qid] = { selected: [], text: "", correct: false, skipped: true };
    updateTrail();
    goNext();
  });

  function goNext() {
    if (session.index < session.total - 1) {
      session.index++;
      renderCurrent();
    } else {
      finishSession();
    }
  }

  elFlagBtn.addEventListener("click", function () {
    var item = currentItem();
    session.flags[item.q.qid] = !session.flags[item.q.qid];
    elFlagBtn.classList.toggle("flagged", !!session.flags[item.q.qid]);
    updateTrail();
  });

  document.getElementById("exitBtn").addEventListener("click", function () {
    if (confirm("¿Salir de la sesión actual? Se perderá el progreso de esta tanda.")) {
      window.location.href = "index.html";
    }
  });

  /* ---------- results ---------- */
  var lastFailedQs = [];

  function finishSession() {
    var correct = 0, wrong = 0, skipped = 0;
    var byTema = {}; // key -> {nombre, asignatura, total, correct}
    var failedQs = [];

    session.test.forEach(function (q) {
      var a = session.answers[q.qid];
      var key = q.asignatura + " · " + q.tema_nombre;
      if (!byTema[key]) byTema[key] = { nombre: q.tema_nombre, asignatura: q.asignatura, total: 0, correct: 0 };
      byTema[key].total++;
      if (!a || a.skipped) { skipped++; return; }
      if (a.correct) { correct++; byTema[key].correct++; }
      else { wrong++; failedQs.push(q); }
    });
    var redSkipped = session.red.filter(function (q) {
      var a = session.answers[q.qid];
      return !a || a.skipped;
    }).length;
    var redAnswered = session.red.length - redSkipped;

    var answered = correct + wrong;
    var pct = answered ? Math.round((correct / answered) * 100) : 0;

    document.getElementById("scoreVal").textContent = session.test.length ? pct + "%" : "—";
    var circumference = 2 * Math.PI * 52;
    var arc = document.getElementById("scoreArc");
    arc.setAttribute("stroke-dasharray", circumference);
    arc.setAttribute("stroke-dashoffset", circumference * (1 - (session.test.length ? pct / 100 : 0)));
    arc.setAttribute("stroke", pct >= 70 ? "#3fc98c" : pct >= 40 ? "#f5b043" : "#e8637a");

    document.getElementById("reportTitle").textContent = !session.test.length
      ? "Redacción guardada"
      : pct >= 80 ? "Buen dominio de este bloque" : pct >= 50 ? "Vas por buen camino" : "Toca repasar este bloque";
    document.getElementById("reportSub").textContent =
      session.test.length + " test · " + session.red.length + " redacción · modo " + (session.mode === "practice" ? "práctica" : "examen");
    document.getElementById("statCorrect").textContent = correct;
    document.getElementById("statWrong").textContent = wrong;
    document.getElementById("statSkipped").textContent = skipped + redSkipped;
    var secs = Math.round((Date.now() - session.startTime) / 1000);
    document.getElementById("statTime").textContent = Math.floor(secs / 60) + ":" + String(secs % 60).padStart(2, "0");

    document.getElementById("testResultsSection").style.display = session.test.length ? "block" : "none";

    var catBreakdown = document.getElementById("catBreakdown");
    catBreakdown.innerHTML = "";
    Object.keys(byTema).forEach(function (key) {
      var d = byTema[key];
      var p = d.total ? Math.round((d.correct / d.total) * 100) : 0;
      var row = document.createElement("div");
      row.className = "cat-row";
      row.innerHTML =
        "<span>" + escapeHtml(d.nombre) + ' &nbsp;<span style="color:var(--text-faint)">' + escapeHtml(d.asignatura) + "</span></span>" +
        '<span class="cbar"><div style="width:' + p + '%"></div></span>' +
        '<span class="cpct">' + d.correct + "/" + d.total + "</span>";
      catBreakdown.appendChild(row);
    });

    var reviewList = document.getElementById("reviewList");
    reviewList.innerHTML = "";
    if (session.test.length === 0) {
      reviewList.innerHTML = '<div class="empty-note">Esta sesión no incluía preguntas tipo test.</div>';
      document.getElementById("retryFailedBtn").style.display = "none";
    } else if (failedQs.length === 0) {
      reviewList.innerHTML = '<div class="empty-note">Ninguna pregunta fallada en esta sesión. Buen trabajo.</div>';
      document.getElementById("retryFailedBtn").style.display = "none";
    } else {
      document.getElementById("retryFailedBtn").style.display = "inline-flex";
      failedQs.forEach(function (q) {
        var item = document.createElement("div");
        item.className = "review-item";
        item.innerHTML =
          '<span class="rmark">' + escapeHtml(q.tema_code) + "</span><span>" +
          escapeHtml(q.enunciado.slice(0, 140)) + (q.enunciado.length > 140 ? "…" : "") + "</span>";
        item.addEventListener("click", function () {
          startSession(session.files, { testPool: [q], redPool: [] });
        });
        reviewList.appendChild(item);
      });
    }
    lastFailedQs = failedQs;

    var redSection = document.getElementById("redaccionResultsSection");
    if (session.red.length > 0 && redAnswered > 0) {
      redSection.style.display = "block";
      var bloque = generarBloqueRedaccion();
      document.getElementById("redaccionPreview").textContent = bloque;
      document.getElementById("downloadRedBtn").onclick = function () {
        descargarTexto(bloque, "redaccion_" + new Date().toISOString().slice(0, 10) + ".txt");
      };
      var copyBtn = document.getElementById("copyPromptBtn");
      var copyBtnDefaultText = "Copiar prompt para IA";
      copyBtn.textContent = copyBtnDefaultText;
      copyBtn.onclick = function () {
        var prompt = generarPromptIA();
        copiarAlPortapapeles(prompt).then(function () {
          copyBtn.textContent = "¡Copiado! Pégalo en tu IA favorita";
          setTimeout(function () { copyBtn.textContent = copyBtnDefaultText; }, 2200);
        }).catch(function () {
          copyBtn.textContent = "No se pudo copiar — usa el .txt";
          setTimeout(function () { copyBtn.textContent = copyBtnDefaultText; }, 2200);
        });
      };
    } else {
      redSection.style.display = "none";
    }

    document.getElementById("view-session").style.display = "none";
    document.getElementById("view-results").style.display = "block";
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  function generarPromptIA() {
    var lineas = [
      "Actúa como profesor corrigiendo un examen de preguntas de desarrollo/redacción.",
      "Para cada pregunta que te paso a continuación:",
      "1. Evalúa mi respuesta según lo que pide el enunciado.",
      "2. Ponme una nota sobre el máximo de puntos indicado entre corchetes.",
      "3. Explica en 2-3 líneas qué está bien, qué falta o qué es incorrecto.",
      "Al final, dame la nota total sumando todas las puntuaciones.",
      "",
      generarBloqueRedaccion(),
    ];
    return lineas.join("\n");
  }

  function copiarAlPortapapeles(texto) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(texto);
    }
    return new Promise(function (resolve, reject) {
      try {
        var ta = document.createElement("textarea");
        ta.value = texto;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        var ok = document.execCommand("copy");
        document.body.removeChild(ta);
        ok ? resolve() : reject(new Error("execCommand falló"));
      } catch (e) {
        reject(e);
      }
    });
  }

  function generarBloqueRedaccion() {
    var sep = "=".repeat(62);
    var lineas = [sep, "BLOQUE PARA CORRECCIÓN — REDACCIÓN", "Generado: " + new Date().toLocaleString("es-ES"), sep];
    session.red.forEach(function (q, i) {
      var a = session.answers[q.qid];
      if (!a || a.skipped) return;
      lineas.push("");
      lineas.push("[PREGUNTA " + (i + 1) + " — " + q.asignatura + " · " + q.tema_nombre + " — " + q.puntos + " puntos]");
      lineas.push("Título: " + (q.titulo || ""));
      lineas.push("Enunciado: " + q.enunciado);
      lineas.push("");
      lineas.push("Respuesta:");
      lineas.push(a.text || "(sin respuesta)");
      lineas.push("");
      lineas.push("─".repeat(62));
    });
    lineas.push("");
    lineas.push("Puntúa cada pregunta sobre su máximo indicado.");
    return lineas.join("\n");
  }

  function descargarTexto(texto, nombre) {
    var blob = new Blob([texto], { type: "text/plain;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  document.getElementById("retryFailedBtn").addEventListener("click", function () {
    if (lastFailedQs.length === 0) return;
    startSession(session.files, { testPool: lastFailedQs, redPool: [] });
  });
  document.getElementById("restartBtn").addEventListener("click", function () {
    window.location.href = "index.html";
  });

  /* ---------- lightbox ---------- */
  var lightbox = document.getElementById("lightbox");
  var lightboxImg = document.getElementById("lightboxImg");
  function openLightbox(src) {
    lightboxImg.src = src;
    lightbox.classList.add("show");
  }
  lightbox.addEventListener("click", function () { lightbox.classList.remove("show"); });

  /* ---------- keyboard shortcuts ---------- */
  document.addEventListener("keydown", function (e) {
    if (document.getElementById("view-session").style.display === "none") return;
    if (document.activeElement && document.activeElement.tagName === "TEXTAREA") return;
    if (e.key === "Enter") elCheckBtn.click();
    if (e.key >= "1" && e.key <= "9") {
      var idx = parseInt(e.key, 10) - 1;
      var row = elOptions.children[idx];
      if (row && !locked) row.click();
    }
  });
})();
