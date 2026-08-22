(function () {
  "use strict";

  var manifest = null;
  var selected = {}; // file -> true
  var filterFailedOnly = false;

  function escapeHtml(s) {
    return (s || "").replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function subjectColor(slug) {
    // hash de-terminista -> tono estable por asignatura, sobre la misma paleta oscura
    var hash = 0;
    for (var i = 0; i < slug.length; i++) hash = (hash * 31 + slug.charCodeAt(i)) >>> 0;
    var hue = hash % 360;
    return "hsl(" + hue + ", 65%, 62%)";
  }

  function questionKey(file, tipo, idx) {
    return file + "#" + tipo + idx;
  }

  fetch("data/manifest.json")
    .then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    })
    .then(function (m) {
      manifest = m;
      init();
    })
    .catch(function (err) {
      document.getElementById("heroCount").textContent = "no se pudo cargar el catálogo";
      var el = document.getElementById("loadError");
      el.style.display = "block";
      el.textContent =
        "No se ha podido cargar data/manifest.json (" + err.message + "). " +
        "Si acabas de añadir un tema nuevo, ejecuta scripts/build_manifest.py y vuelve a hacer commit/push. " +
        "Si estás abriendo el archivo en local con doble clic, algunos navegadores bloquean fetch() sobre file:// — usa un servidor local (por ejemplo `python -m http.server`) o GitHub Pages.";
    });

  function init() {
    document.getElementById("heroCount").textContent =
      manifest.totals.asignaturas + " asignatura(s) · " + manifest.totals.temas + " tema(s) · " +
      manifest.totals.test + " preguntas test · " + manifest.totals.redaccion + " de redacción";
    document.getElementById("mainContent").style.display = "block";

    manifest.asignaturas.forEach(function (a) {
      a.temas.forEach(function (t) {
        selected[t.file] = true;
      });
    });

    renderSubjects();
    renderGlobalStat();
    setupFailedButton();
    setupControls();
    updateStartBar();
  }

  function statsForTema(t) {
    var stats = window.ExamStorage.all();
    var seen = 0,
      failed = 0;
    for (var i = 0; i < t.test_count; i++) {
      var s = stats[questionKey(t.file, "t", i)];
      if (s) {
        seen++;
        if (s.lastWrong) failed++;
      }
    }
    return { seen: seen, failed: failed, pct: t.test_count ? Math.round((seen / t.test_count) * 100) : 0 };
  }

  function renderSubjects() {
    var container = document.getElementById("subjectList");
    container.innerHTML = "";
    manifest.asignaturas.forEach(function (a, aIdx) {
      var color = subjectColor(a.slug);
      var totalTest = a.temas.reduce(function (s, t) { return s + t.test_count; }, 0);
      var totalRed = a.temas.reduce(function (s, t) { return s + t.redaccion_count; }, 0);
      var anyEncrypted = a.temas.some(function (t) { return t.encrypted; });

      var subj = document.createElement("div");
      subj.className = "subject" + (aIdx === 0 ? " open" : "");
      subj.dataset.slug = a.slug;

      var head = document.createElement("div");
      head.className = "subject-head";
      head.innerHTML =
        '<span class="subject-swatch" style="background:' + color + '"></span>' +
        '<span class="subject-name">' + escapeHtml(a.nombre) + (anyEncrypted ? ' <svg class="lock-icon" viewBox="0 0 24 24" fill="none"><rect x="5" y="11" width="14" height="9" rx="2" stroke="currentColor" stroke-width="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="currentColor" stroke-width="2"/></svg>' : '') + "</span>" +
        '<span class="subject-meta">' + a.temas.length + " temas · " + totalTest + " test · " + totalRed + " redacción</span>" +
        '<button class="subject-toggle-all" type="button">todo/nada</button>' +
        '<svg class="subject-chevron" viewBox="0 0 24 24" fill="none"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      head.addEventListener("click", function (e) {
        if (e.target.closest(".subject-toggle-all")) return;
        subj.classList.toggle("open");
      });
      head.querySelector(".subject-toggle-all").addEventListener("click", function (e) {
        e.stopPropagation();
        var body = subj.querySelector(".subject-body");
        var anySelected = a.temas.some(function (t) { return selected[t.file]; });
        a.temas.forEach(function (t) { selected[t.file] = !anySelected; });
        Array.prototype.forEach.call(body.children, function (card, i) {
          card.classList.toggle("checked", selected[a.temas[i].file]);
        });
        updateStartBar();
      });

      var body = document.createElement("div");
      body.className = "subject-body";
      a.temas.forEach(function (t) {
        var st = statsForTema(t);
        var card = document.createElement("div");
        card.className = "topic-card" + (selected[t.file] ? " checked" : "");
        card.innerHTML =
          '<div class="topic-top">' +
          '<span>' + (t.encrypted ? '<svg class="lock-icon" viewBox="0 0 24 24" fill="none"><rect x="5" y="11" width="14" height="9" rx="2" stroke="currentColor" stroke-width="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="currentColor" stroke-width="2"/></svg>' : '') + '</span>' +
          '<span class="topic-check"><svg viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="#052420" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg></span>' +
          "</div>" +
          '<div class="topic-name">' + escapeHtml(t.nombre) + "</div>" +
          '<div class="topic-count">' + t.test_count + " test" + (t.redaccion_count ? " · " + t.redaccion_count + " redacción" : "") +
          (st.failed ? ' · <span style="color:var(--red)">' + st.failed + " falladas</span>" : "") +
          "</div>" +
          '<div class="topic-progress"><div style="width:' + st.pct + '%"></div></div>';
        card.addEventListener("click", function () {
          selected[t.file] = !selected[t.file];
          card.classList.toggle("checked", selected[t.file]);
          updateStartBar();
        });
        body.appendChild(card);
      });

      subj.appendChild(head);
      subj.appendChild(body);
      container.appendChild(subj);
    });
  }

  function renderGlobalStat() {
    var acc = window.ExamStorage.globalAccuracy();
    var el = document.getElementById("globalStat");
    if (!acc) return;
    el.innerHTML = "<b>" + acc.seenQuestions + "</b> preguntas practicadas · <b>" + acc.pct + "%</b> acierto histórico";
    el.classList.add("visible");
  }

  function setupFailedButton() {
    var stats = window.ExamStorage.all();
    var hasFailed = Object.keys(stats).some(function (id) { return stats[id].lastWrong; });
    var btn = document.getElementById("selectFailed");
    if (!hasFailed) return;
    btn.style.display = "inline-block";
    btn.addEventListener("click", function () {
      manifest.asignaturas.forEach(function (a) {
        a.temas.forEach(function (t) {
          var st = statsForTema(t);
          selected[t.file] = st.failed > 0;
        });
      });
      filterFailedOnly = true;
      renderSubjects();
      document.querySelectorAll(".subject").forEach(function (s) { s.classList.add("open"); });
      updateStartBar();
    });
  }

  var sessionMode = "practice";
  var sessionOrder = "random";

  function setupControls() {
    document.getElementById("modeSeg").addEventListener("click", function (e) {
      var b = e.target.closest("button");
      if (!b) return;
      document.querySelectorAll("#modeSeg button").forEach(function (x) { x.classList.remove("active"); });
      b.classList.add("active");
      sessionMode = b.dataset.mode;
      document.getElementById("modeDesc").textContent =
        sessionMode === "practice"
          ? "Corriges cada pregunta al momento y lees la explicación antes de continuar. Ideal para estudiar."
          : "Respondes todo seguido y ves el resultado y las explicaciones al final. Simula un examen real.";
      updateStartBar();
    });
    document.getElementById("orderSeg").addEventListener("click", function (e) {
      var b = e.target.closest("button");
      if (!b) return;
      document.querySelectorAll("#orderSeg button").forEach(function (x) { x.classList.remove("active"); });
      b.classList.add("active");
      sessionOrder = b.dataset.order;
    });

    ["countTest", "countRed"].forEach(function (id) {
      var input = document.getElementById(id);
      input.addEventListener("input", function () {
        refreshSummary();
      });
    });

    document.getElementById("selectAll").addEventListener("click", function () {
      manifest.asignaturas.forEach(function (a) { a.temas.forEach(function (t) { selected[t.file] = true; }); });
      filterFailedOnly = false;
      renderSubjects();
      updateStartBar();
    });
    document.getElementById("selectNone").addEventListener("click", function () {
      manifest.asignaturas.forEach(function (a) { a.temas.forEach(function (t) { selected[t.file] = false; }); });
      renderSubjects();
      updateStartBar();
    });

    document.getElementById("startBtn").addEventListener("click", startSession);
  }

  function selectedTemas() {
    var list = [];
    manifest.asignaturas.forEach(function (a) {
      a.temas.forEach(function (t) {
        if (selected[t.file]) {
          list.push({
            file: t.file,
            tema_id: t.tema_id,
            nombre: t.nombre,
            asignatura: a.nombre,
            asignatura_slug: a.slug,
            test_count: t.test_count,
            redaccion_count: t.redaccion_count,
          });
        }
      });
    });
    return list;
  }

  function refreshAvailability() {
    var temas = selectedTemas();
    var totalTest = temas.reduce(function (s, t) { return s + t.test_count; }, 0);
    var totalRed = temas.reduce(function (s, t) { return s + t.redaccion_count; }, 0);

    var ct = document.getElementById("countTest");
    var cr = document.getElementById("countRed");
    ct.max = totalTest;
    cr.max = totalRed;
    ct.value = totalTest;
    cr.value = totalRed;
    document.getElementById("testAvail").textContent = totalTest;
    document.getElementById("redAvail").textContent = totalRed;
    refreshSummary();
  }

  function refreshSummary() {
    var ct = document.getElementById("countTest");
    var cr = document.getElementById("countRed");
    document.getElementById("countTestVal").textContent = ct.value;
    document.getElementById("countRedVal").textContent = cr.value;

    var nTest = parseInt(ct.value, 10) || 0;
    var nRed = parseInt(cr.value, 10) || 0;
    document.getElementById("selCount").textContent = nTest + nRed;
    document.getElementById("selMode").textContent = sessionMode === "practice" ? "práctica" : "examen";
    document.getElementById("startBtn").disabled = selectedTemas().length === 0 || nTest + nRed === 0;
  }

  // updateStartBar mantiene el nombre usado en el resto del archivo, pero ahora
  // solo recalcula disponibilidad (uso: tras cambiar selección de temas/asignaturas).
  function updateStartBar() {
    refreshAvailability();
  }

  function startSession() {
    var config = {
      temas: selectedTemas(),
      mode: sessionMode,
      order: sessionOrder,
      numTest: parseInt(document.getElementById("countTest").value, 10) || 0,
      numRed: parseInt(document.getElementById("countRed").value, 10) || 0,
      onlyFailed: filterFailedOnly,
    };
    sessionStorage.setItem("examConfig", JSON.stringify(config));
    window.location.href = "quiz.html";
  }
})();
