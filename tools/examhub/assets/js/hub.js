(function () {
  "use strict";

  var manifest = null;
  var selected = {}; // file -> true
  var filterFailedOnly = false;

  var TRASH_ICON =
    '<svg viewBox="0 0 24 24" fill="none"><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0-.8 12.1a2 2 0 0 1-2 1.9H9.8a2 2 0 0 1-2-1.9L7 7h10Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

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

    // Sin selección por defecto: el usuario elige qué quiere practicar.
    renderSubjects();
    renderGlobalStat();
    setupFailedButton();
    setupProgressTools();
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
    // Recordamos qué asignaturas estaban abiertas antes de repintar, para no
    // colapsar el acordeón cada vez que se borra/actualiza progreso.
    var openSlugs = Array.prototype.map.call(container.querySelectorAll(".subject.open"), function (el) {
      return el.dataset.slug;
    });
    var hadContent = container.children.length > 0;

    container.innerHTML = "";
    manifest.asignaturas.forEach(function (a, aIdx) {
      var color = subjectColor(a.slug);
      var totalTest = a.temas.reduce(function (s, t) { return s + t.test_count; }, 0);
      var totalRed = a.temas.reduce(function (s, t) { return s + t.redaccion_count; }, 0);
      var anyEncrypted = a.temas.some(function (t) { return t.encrypted; });
      var totalSeen = a.temas.reduce(function (s, t) { return s + statsForTema(t).seen; }, 0);
      var wasOpen = hadContent ? openSlugs.indexOf(a.slug) !== -1 : aIdx === 0;

      var subj = document.createElement("div");
      subj.className = "subject" + (wasOpen ? " open" : "");
      subj.dataset.slug = a.slug;

      var head = document.createElement("div");
      head.className = "subject-head";
      head.innerHTML =
        '<span class="subject-swatch" style="background:' + color + '"></span>' +
        '<span class="subject-name">' + escapeHtml(a.nombre) + (anyEncrypted ? ' <svg class="lock-icon" viewBox="0 0 24 24" fill="none"><rect x="5" y="11" width="14" height="9" rx="2" stroke="currentColor" stroke-width="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="currentColor" stroke-width="2"/></svg>' : '') + "</span>" +
        '<span class="subject-meta">' + a.temas.length + " temas · " + totalTest + " test · " + totalRed + " redacción</span>" +
        (totalSeen ? '<button class="subject-clear-btn" type="button" title="Borrar progreso de esta asignatura">' + TRASH_ICON + '</button>' : '') +
        '<button class="subject-toggle-all" type="button">todo/nada</button>' +
        '<svg class="subject-chevron" viewBox="0 0 24 24" fill="none"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      head.addEventListener("click", function (e) {
        if (e.target.closest(".subject-toggle-all") || e.target.closest(".subject-clear-btn")) return;
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
      var clearSubjBtn = head.querySelector(".subject-clear-btn");
      if (clearSubjBtn) {
        clearSubjBtn.addEventListener("click", function (e) {
          e.stopPropagation();
          if (!confirm('¿Borrar todo el progreso guardado de "' + a.nombre + '"? Esta acción no se puede deshacer.')) return;
          window.ExamStorage.clearFiles(a.temas.map(function (t) { return t.file; }));
          renderSubjects();
          renderGlobalStat();
          updateFailedButtonVisibility();
          updateClearAllVisibility();
        });
      }

      var body = document.createElement("div");
      body.className = "subject-body";
      a.temas.forEach(function (t) {
        var st = statsForTema(t);
        var card = document.createElement("div");
        card.className = "topic-card" + (selected[t.file] ? " checked" : "");
        card.innerHTML =
          '<div class="topic-top">' +
          '<span class="topic-left">' +
          (t.encrypted ? '<svg class="lock-icon" viewBox="0 0 24 24" fill="none"><rect x="5" y="11" width="14" height="9" rx="2" stroke="currentColor" stroke-width="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="currentColor" stroke-width="2"/></svg>' : '') +
          (st.seen ? '<button class="topic-clear-btn" type="button" title="Borrar progreso de este tema">' + TRASH_ICON + '</button>' : '') +
          '</span>' +
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
        var clearTopicBtn = card.querySelector(".topic-clear-btn");
        if (clearTopicBtn) {
          clearTopicBtn.addEventListener("click", function (e) {
            e.stopPropagation();
            if (!confirm('¿Borrar el progreso guardado del tema "' + t.nombre + '"?')) return;
            window.ExamStorage.clearTema(t.file);
            renderSubjects();
            renderGlobalStat();
            updateFailedButtonVisibility();
            updateClearAllVisibility();
          });
        }
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
    if (!acc) {
      el.classList.remove("visible");
      el.innerHTML = "";
      return;
    }
    el.innerHTML = "<b>" + acc.seenQuestions + "</b> preguntas practicadas · <b>" + acc.pct + "%</b> acierto histórico";
    el.classList.add("visible");
  }

  function setupFailedButton() {
    var btn = document.getElementById("selectFailed");
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
    updateFailedButtonVisibility();
  }

  function updateFailedButtonVisibility() {
    var stats = window.ExamStorage.all();
    var hasFailed = Object.keys(stats).some(function (id) { return stats[id].lastWrong; });
    document.getElementById("selectFailed").style.display = hasFailed ? "inline-block" : "none";
  }

  function updateClearAllVisibility() {
    var stats = window.ExamStorage.all();
    var hasAny = Object.keys(stats).length > 0;
    var btn = document.getElementById("clearAllProgressBtn");
    if (btn) btn.style.display = hasAny ? "inline-block" : "none";
  }

  function setupProgressTools() {
    var exportBtn = document.getElementById("exportProgressBtn");
    var importBtn = document.getElementById("importProgressBtn");
    var importFile = document.getElementById("importProgressFile");
    var clearAllBtn = document.getElementById("clearAllProgressBtn");

    if (exportBtn) {
      exportBtn.addEventListener("click", function () {
        var json = window.ExamStorage.exportJSON();
        var blob = new Blob([json], { type: "application/json" });
        var url = URL.createObjectURL(blob);
        var stamp = new Date().toISOString().slice(0, 10);
        var link = document.createElement("a");
        link.href = url;
        link.download = "examhub-progreso-" + stamp + ".json";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      });
    }

    if (importBtn && importFile) {
      importBtn.addEventListener("click", function () {
        importFile.value = "";
        importFile.click();
      });
      importFile.addEventListener("change", function () {
        var file = importFile.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function () {
          var merge = confirm(
            "¿Cómo quieres importar este progreso?\n\n" +
              "Aceptar = combinar con tu progreso actual (recomendado).\n" +
              "Cancelar = reemplazar todo tu progreso actual por el del archivo importado."
          );
          try {
            window.ExamStorage.importJSON(reader.result, merge ? "merge" : "replace");
          } catch (e) {
            alert("No se ha podido importar el archivo: " + e.message);
            return;
          }
          renderSubjects();
          renderGlobalStat();
          updateFailedButtonVisibility();
          updateClearAllVisibility();
          alert("Progreso importado correctamente.");
        };
        reader.onerror = function () {
          alert("No se ha podido leer el archivo.");
        };
        reader.readAsText(file);
      });
    }

    if (clearAllBtn) {
      clearAllBtn.addEventListener("click", function () {
        if (!confirm("¿Borrar TODO tu progreso guardado en este navegador? Esta acción no se puede deshacer.")) return;
        window.ExamStorage.clearAll();
        renderSubjects();
        renderGlobalStat();
        updateFailedButtonVisibility();
        updateClearAllVisibility();
      });
    }

    updateClearAllVisibility();
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