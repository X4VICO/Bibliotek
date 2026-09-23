(function () {
  "use strict";

  var manifest = null;
  var baseAsignaturas = null; // asignaturas reales de data/manifest.json, sin tocar
  var selected = {}; // file -> true
  var filterFailedOnly = false;

  var CUSTOM_SLUG = "mis-preguntas";
  var CUSTOM_SUBJECT_NAME = "Mis preguntas";

  var TRASH_ICON =
    '<svg viewBox="0 0 24 24" fill="none"><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0-.8 12.1a2 2 0 0 1-2 1.9H9.8a2 2 0 0 1-2-1.9L7 7h10Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var DELETE_ICON =
    '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2"/><path d="M9.5 9.5l5 5M14.5 9.5l-5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

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

  // ---------- "Mis preguntas": asignatura virtual con los módulos subidos ----------
  // No viven en data/manifest.json — se leen de localStorage y se mezclan en
  // memoria con las asignaturas reales, para que el resto de la app (acordeón,
  // selección, contador de progreso, export de falladas...) las trate igual.
  function buildCustomAsignatura() {
    var modules = window.ExamStorage.listCustomModules();
    if (!modules.length) return null;
    return {
      slug: CUSTOM_SLUG,
      nombre: CUSTOM_SUBJECT_NAME,
      custom: true,
      temas: modules.map(function (m) {
        return {
          tema_id: m.tema_id,
          nombre: m.tema,
          orden: m.orden || 0,
          file: window.ExamStorage.customFileId(m.tema_id),
          test_count: (m.test || []).length,
          redaccion_count: (m.redaccion || []).length,
          encrypted: false,
          custom: true,
        };
      }),
    };
  }

  function rebuildAsignaturas() {
    var custom = buildCustomAsignatura();
    manifest.asignaturas = custom ? [custom].concat(baseAsignaturas) : baseAsignaturas.slice();
  }

  fetch("data/manifest.json")
    .then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    })
    .then(function (m) {
      manifest = m;
      baseAsignaturas = m.asignaturas;
      rebuildAsignaturas();
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

  function updateHeroCount() {
    // Se recalcula desde manifest.asignaturas (no manifest.totals, que es
    // estático del manifest.json del servidor) para reflejar también los
    // módulos de "Mis preguntas", que solo existen en este navegador.
    var temas = 0, test = 0, red = 0;
    manifest.asignaturas.forEach(function (a) {
      temas += a.temas.length;
      a.temas.forEach(function (t) {
        test += t.test_count;
        red += t.redaccion_count;
      });
    });
    document.getElementById("heroCount").textContent =
      manifest.asignaturas.length + " asignatura(s) · " + temas + " tema(s) · " +
      test + " preguntas test · " + red + " de redacción";
  }

  function init() {
    updateHeroCount();
    document.getElementById("mainContent").style.display = "block";

    // Sin selección por defecto: el usuario elige qué quiere practicar.
    renderSubjects();
    renderGlobalStat();
    setupFailedButton();
    setupProgressTools();
    setupFailedModal();
    setupControls();
    setupCustomUpload();
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
        (a.custom ? '<button class="subject-delete-all-btn" type="button" title="Eliminar todos los módulos de Mis preguntas (preguntas + progreso)">' + DELETE_ICON + ' todos</button>' : '') +
        '<button class="subject-toggle-all" type="button">todo/nada</button>' +
        '<svg class="subject-chevron" viewBox="0 0 24 24" fill="none"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      head.addEventListener("click", function (e) {
        if (e.target.closest(".subject-toggle-all") || e.target.closest(".subject-clear-btn") || e.target.closest(".subject-delete-all-btn")) return;
        subj.classList.toggle("open");
      });
      head.querySelector(".subject-toggle-all").addEventListener("click", function (e) {
        e.stopPropagation();
        var body = subj.querySelector(".subject-body");
        var anySelected = a.temas.some(function (t) { return selected[t.file]; });
        a.temas.forEach(function (t) { selected[t.file] = !anySelected; });
        filterFailedOnly = false; // selección manual: se decide al pulsar "Empezar sesión"
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
      var deleteAllBtn = head.querySelector(".subject-delete-all-btn");
      if (deleteAllBtn) {
        deleteAllBtn.addEventListener("click", function (e) {
          e.stopPropagation();
          if (!confirm('¿Eliminar TODOS los módulos de "Mis preguntas" (' + a.temas.length + ')? Se borran sus preguntas y su progreso. Esta acción no se puede deshacer.')) return;
          a.temas.forEach(function (t) { delete selected[t.file]; });
          window.ExamStorage.deleteAllCustomModules();
          rebuildAsignaturas();
          updateHeroCount();
          renderSubjects();
          renderGlobalStat();
          updateFailedButtonVisibility();
          updateClearAllVisibility();
          updateStartBar();
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
          (t.custom ? '<button class="topic-delete-btn" type="button" title="Eliminar este módulo (preguntas + progreso)">' + DELETE_ICON + '</button>' : '') +
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
          filterFailedOnly = false; // selección manual: se decide al pulsar "Empezar sesión"
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
        var deleteTopicBtn = card.querySelector(".topic-delete-btn");
        if (deleteTopicBtn) {
          deleteTopicBtn.addEventListener("click", function (e) {
            e.stopPropagation();
            if (!confirm('¿Eliminar el módulo "' + t.nombre + '"? Se borran sus preguntas y el progreso guardado. Esta acción no se puede deshacer.')) return;
            delete selected[t.file];
            window.ExamStorage.deleteCustomModule(t.tema_id);
            rebuildAsignaturas();
            updateHeroCount();
            renderSubjects();
            renderGlobalStat();
            updateFailedButtonVisibility();
            updateClearAllVisibility();
            updateStartBar();
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
    var exportFailedBtn = document.getElementById("exportFailedBtn");
    if (exportFailedBtn) exportFailedBtn.style.display = hasFailed ? "inline-block" : "none";
  }

  // Cuántas preguntas de test están falladas dentro de la selección actual
  // de temas (no de todo el catálogo, solo lo que el usuario ha marcado).
  function failedCountInSelection() {
    var total = 0;
    selectedTemas().forEach(function (t) {
      total += statsForTema(t).failed;
    });
    return total;
  }

  function openFailedModal(count) {
    var modal = document.getElementById("failedModal");
    if (!modal) {
      startSession();
      return;
    }
    var c1 = document.getElementById("failedModalCount");
    var c2 = document.getElementById("failedModalCount2");
    if (c1) c1.textContent = count;
    if (c2) c2.textContent = count;
    modal.style.display = "flex";
  }

  function setupFailedModal() {
    var modal = document.getElementById("failedModal");
    if (!modal) return;

    document.getElementById("failedModalRetryBtn").addEventListener("click", function () {
      filterFailedOnly = true;
      modal.style.display = "none";
      startSession();
    });
    document.getElementById("failedModalFullBtn").addEventListener("click", function () {
      filterFailedOnly = false;
      modal.style.display = "none";
      startSession();
    });
    document.getElementById("failedModalCancelBtn").addEventListener("click", function () {
      modal.style.display = "none";
    });
    modal.addEventListener("click", function (e) {
      if (e.target === modal) modal.style.display = "none";
    });
  }

  // ---------- exportar preguntas falladas (texto listo para pegar en una IA) ----------

  // Modal de contraseña reutilizable para el export: a diferencia del modal
  // de quiz.html, aquí se puede "omitir" un tema si no se tiene la clave a mano.
  function askExportPassword(label, isRetry) {
    return new Promise(function (resolve) {
      var modal = document.getElementById("exportPasswordModal");
      if (!modal) {
        resolve(null);
        return;
      }
      var desc = document.getElementById("exportPasswordDesc");
      var input = document.getElementById("exportPasswordInput");
      var errorEl = document.getElementById("exportPasswordError");
      var submitBtn = document.getElementById("exportPasswordSubmitBtn");
      var skipBtn = document.getElementById("exportPasswordSkipBtn");

      desc.textContent = 'Introduce la contraseña para incluir las falladas de "' + label + '" en la exportación.';
      errorEl.style.display = isRetry ? "block" : "none";
      input.value = "";
      modal.style.display = "flex";
      setTimeout(function () { input.focus(); }, 0);

      function cleanup() {
        modal.style.display = "none";
        submitBtn.removeEventListener("click", onSubmit);
        skipBtn.removeEventListener("click", onSkip);
        input.removeEventListener("keydown", onKeydown);
      }
      function onSubmit() {
        var val = input.value;
        cleanup();
        resolve(val || null);
      }
      function onSkip() {
        cleanup();
        resolve(null);
      }
      function onKeydown(e) {
        if (e.key === "Enter") onSubmit();
      }
      submitBtn.addEventListener("click", onSubmit);
      skipBtn.addEventListener("click", onSkip);
      input.addEventListener("keydown", onKeydown);
    });
  }

  // Descifra un tema cifrado para el export. Reintenta la contraseña si es
  // incorrecta; devuelve null si el usuario decide omitir el tema.
  async function decryptTemaForExport(tf, lastPasswordRef) {
    var encTema;
    try {
      var res = await fetch(tf.file);
      if (!res.ok) throw new Error("HTTP " + res.status);
      encTema = await res.json();
    } catch (e) {
      console.error('[ExamHub] No se ha podido descargar/leer el archivo del tema "' + tf.tema + '":', e);
      alert(
        'No se ha podido descargar el archivo del tema "' + tf.tema + '" (' + e.message + '). ' +
          "Se omite este tema. Abre la consola del navegador (F12) para ver el detalle."
      );
      return null;
    }

    var pwd = lastPasswordRef.value;
    var isRetry = false;
    while (true) {
      if (!pwd) {
        pwd = await askExportPassword(tf.tema, isRetry);
        if (!pwd) return null; // el usuario ha omitido este tema
      }
      try {
        var data = await window.CryptoLock.decryptTema(encTema, pwd);
        lastPasswordRef.value = pwd; // reutilizar en el siguiente tema cifrado
        return data;
      } catch (e) {
        console.error('[ExamHub] Fallo al descifrar "' + tf.tema + '" con la contraseña introducida:', e);
        pwd = null;
        isRetry = true;
      }
    }
  }

  function buildFailedExportText(blocks) {
    var byGroup = {};
    var order = [];
    blocks.forEach(function (b) {
      var key = b.asignatura + " — " + b.tema;
      if (!byGroup[key]) {
        byGroup[key] = [];
        order.push(key);
      }
      byGroup[key].push(b);
    });

    var letters = "abcdefgh";
    var lines = [];
    lines.push(
      "Estas son preguntas de test que he fallado repasando. Para cada una, explícame la teoría " +
        "relacionada y por qué la respuesta marcada como correcta lo es, con un lenguaje claro y sin " +
        "alargarte más de lo necesario."
    );
    lines.push("");

    order.forEach(function (key) {
      lines.push("## " + key);
      lines.push("");
      byGroup[key].forEach(function (b, idx) {
        lines.push((idx + 1) + ". " + b.enunciado);
        (b.opciones || []).forEach(function (op, i) {
          lines.push("   " + (letters[i] || i) + ") " + op.texto + (op.correcta ? "  [CORRECTA]" : ""));
        });
        if (b.explicacion) {
          lines.push("   Explicación del banco de preguntas: " + b.explicacion);
        }
        lines.push("");
      });
    });

    return lines.join("\n");
  }

  function downloadFailedExport(blocks) {
    var text = buildFailedExportText(blocks);
    var blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var stamp = new Date().toISOString().slice(0, 10);
    var link = document.createElement("a");
    link.href = url;
    link.download = "examhub-falladas-" + stamp + ".txt";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  async function exportFailedQuestions() {
    var stats = window.ExamStorage.all();
    // Recolecta, por tema de TODO el catálogo (no solo lo seleccionado en
    // pantalla), qué índices de pregunta están marcados como fallados.
    var temaFailures = [];
    manifest.asignaturas.forEach(function (a) {
      a.temas.forEach(function (t) {
        var indices = [];
        for (var i = 0; i < t.test_count; i++) {
          var s = stats[questionKey(t.file, "t", i)];
          if (s && s.lastWrong) indices.push(i);
        }
        if (indices.length) {
          temaFailures.push({
            asignatura: a.nombre,
            tema: t.nombre,
            file: t.file,
            encrypted: t.encrypted,
            indices: indices,
          });
        }
      });
    });

    if (!temaFailures.length) {
      alert("No tienes preguntas falladas guardadas todavía.");
      return;
    }

    var btn = document.getElementById("exportFailedBtn");
    var originalLabel = btn ? btn.textContent : null;
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Generando…";
    }

    var lastPassword = { value: null };
    var blocks = [];
    var skippedTemas = [];

    for (var i = 0; i < temaFailures.length; i++) {
      var tf = temaFailures[i];
      var content = null;
      try {
        if (tf.encrypted) {
          content = await decryptTemaForExport(tf, lastPassword);
        } else if (window.ExamStorage.isCustomFile(tf.file)) {
          content = window.ExamStorage.getCustomModule(window.ExamStorage.temaIdFromFile(tf.file));
          if (!content) throw new Error("módulo ya no está guardado en este navegador");
        } else {
          var res = await fetch(tf.file);
          if (!res.ok) throw new Error("HTTP " + res.status);
          content = await res.json();
        }
      } catch (e) {
        content = null;
      }
      if (!content) {
        skippedTemas.push(tf.tema);
        continue;
      }
      tf.indices.forEach(function (idx) {
        var q = content.test && content.test[idx];
        if (!q) return;
        blocks.push({
          asignatura: tf.asignatura,
          tema: tf.tema,
          enunciado: q.enunciado,
          opciones: q.opciones,
          explicacion: q.explicacion || "",
        });
      });
    }

    if (btn) {
      btn.disabled = false;
      btn.textContent = originalLabel;
    }

    if (!blocks.length) {
      alert(
        "No se ha podido recuperar ninguna pregunta fallada" +
          (skippedTemas.length ? " (temas omitidos: " + skippedTemas.join(", ") + ")" : "") +
          "."
      );
      return;
    }

    downloadFailedExport(blocks);

    if (skippedTemas.length) {
      alert(
        "Exportado. No se han podido incluir las falladas de: " +
          skippedTemas.join(", ") +
          " (sin contraseña correcta)."
      );
    }
  }

  function updateClearAllVisibility() {
    var stats = window.ExamStorage.all();
    var hasAny = Object.keys(stats).length > 0;
    var btn = document.getElementById("clearAllProgressBtn");
    if (btn) btn.style.display = hasAny ? "inline-block" : "none";
  }

  function setupProgressTools() {
    var exportBtn = document.getElementById("exportProgressBtn");
    var exportFailedBtn = document.getElementById("exportFailedBtn");
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

    if (exportFailedBtn) {
      exportFailedBtn.addEventListener("click", function () {
        exportFailedQuestions();
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
      filterFailedOnly = false;
      renderSubjects();
      updateStartBar();
    });

    document.getElementById("startBtn").addEventListener("click", function () {
      var failed = failedCountInSelection();
      if (!filterFailedOnly && failed > 0) {
        openFailedModal(failed);
      } else {
        startSession();
      }
    });
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

  // ---------- "Cargar tus preguntas": subir un JSON propio a "Mis preguntas" ----------

  var CUSTOM_PROMPT_TEXT =
    "Quiero que conviertas el contenido que te voy a pegar (apuntes, un examen, diapositivas...) " +
    "en preguntas tipo test y, si tiene sentido, preguntas de redacción. Devuélveme ÚNICAMENTE un " +
    "JSON válido con este formato exacto, sin texto antes ni después, y sin bloques de código " +
    "(nada de ```):\n\n" +
    "{\n" +
    '  "tema": "Nombre corto del tema",\n' +
    '  "test": [\n' +
    "    {\n" +
    '      "enunciado": "Texto de la pregunta",\n' +
    '      "opciones": [\n' +
    '        { "texto": "Opción A", "correcta": false },\n' +
    '        { "texto": "Opción B", "correcta": true }\n' +
    "      ],\n" +
    '      "explicacion": "Por qué es correcta (opcional, pero ayuda mucho a repasar)"\n' +
    "    }\n" +
    "  ],\n" +
    '  "redaccion": [\n' +
    '    { "titulo": "Título corto", "enunciado": "Pregunta de desarrollo", "puntos": 10 }\n' +
    "  ]\n" +
    "}\n\n" +
    "Reglas:\n" +
    '- Puede haber cualquier número de preguntas en "test" y "redaccion" (0 o más). Si no hay ' +
    'preguntas de redacción, deja "redaccion": [].\n' +
    '- Cada pregunta de "test" debe tener al menos una opción con "correcta": true. Puede haber ' +
    "más de una correcta si la pregunta lo permite (varias respuestas válidas).\n" +
    "- No inventes datos que no estén en el texto que te paso: si algo no queda claro, indícalo en " +
    '"explicacion" en vez de inventarlo.\n' +
    "- Responde solo con el JSON, para poder guardarlo tal cual como archivo .json y subirlo " +
    "directamente aquí.\n\n" +
    "Aquí está el contenido a convertir:\n" +
    "[PEGA AQUÍ TUS APUNTES, EXAMEN O PREGUNTAS]";

  function slugifyId(base) {
    var s = (base || "modulo")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
    return s || "modulo";
  }

  function uniqueTemaId(base) {
    var id = "custom_" + slugifyId(base);
    var existingIds = window.ExamStorage.listCustomModules().map(function (m) { return m.tema_id; });
    if (existingIds.indexOf(id) === -1) return id;
    var i = 2;
    while (existingIds.indexOf(id + "_" + i) !== -1) i++;
    return id + "_" + i;
  }

  // Validación en el navegador — replica a mínima escala las reglas de
  // scripts/build_manifest.py, para no dejar entrar un archivo que luego
  // rompería la sesión de examen.
  function validateCustomTemaJSON(data) {
    var errors = [];
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      errors.push("el archivo no contiene un objeto JSON válido.");
      return errors;
    }
    if (!data.tema || typeof data.tema !== "string" || !data.tema.trim()) {
      errors.push('falta la clave "tema" (nombre del tema, en texto).');
    }
    if (!Array.isArray(data.test)) {
      errors.push('falta la clave "test" (tiene que ser un array; puede estar vacío: []).');
    } else {
      data.test.forEach(function (p, i) {
        if (!p || typeof p !== "object") {
          errors.push("test[" + i + "] no es un objeto válido.");
          return;
        }
        if (!p.enunciado) errors.push("test[" + i + "] no tiene 'enunciado'.");
        var tipo = p.tipo || "opcion";
        if (tipo === "matching_table" || tipo === "matching_image") return;
        var correctas = (p.opciones || []).filter(function (o) { return o && o.correcta; }).length;
        if (correctas === 0) errors.push("test[" + i + "] no tiene ninguna opción marcada como correcta.");
      });
    }
    if (data.redaccion && !Array.isArray(data.redaccion)) {
      errors.push('"redaccion" tiene que ser un array (o puedes omitirla directamente).');
    }
    return errors;
  }

  function copyToClipboard(text, btn) {
    var done = function () {
      if (!btn) return;
      var original = btn.textContent;
      btn.textContent = "¡Copiado!";
      setTimeout(function () { btn.textContent = original; }, 1600);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(function () { fallbackCopy(text, done); });
    } else {
      fallbackCopy(text, done);
    }
  }

  function fallbackCopy(text, done) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); } catch (e) {}
    document.body.removeChild(ta);
    if (done) done();
  }

  function openPromptModal() {
    var modal = document.getElementById("customPromptModal");
    if (modal) modal.style.display = "flex";
  }

  function setupPromptModal() {
    var modal = document.getElementById("customPromptModal");
    if (!modal) return;
    var textEl = document.getElementById("customPromptText");
    if (textEl) textEl.textContent = CUSTOM_PROMPT_TEXT;

    var closeBtn = document.getElementById("customPromptCloseBtn");
    if (closeBtn) closeBtn.addEventListener("click", function () { modal.style.display = "none"; });

    var copyBtn = document.getElementById("customPromptCopyBtn");
    if (copyBtn) {
      copyBtn.addEventListener("click", function () { copyToClipboard(CUSTOM_PROMPT_TEXT, copyBtn); });
    }
    modal.addEventListener("click", function (e) {
      if (e.target === modal) modal.style.display = "none";
    });
  }

  // Reutiliza el mismo patrón que el README del index.html raíz de Bibliotek
  // (fetch + marked.js si está disponible, si no texto plano).
  var isReadmeOpen = false;
  function toggleReadme() {
    var card = document.getElementById("readmeCard");
    var content = document.getElementById("readmeContent");
    var btn = document.getElementById("readmeBtn");
    if (!card || !content || !btn) return;

    if (isReadmeOpen) {
      card.style.display = "none";
      btn.innerHTML = "📖 Ver README";
      isReadmeOpen = false;
      return;
    }

    card.style.display = "block";
    btn.innerHTML = "❌ Ocultar README";
    content.innerHTML = "<p>Cargando README.md…</p>";
    isReadmeOpen = true;
    card.scrollIntoView({ behavior: "smooth", block: "start" });

    fetch("README.md")
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.text();
      })
      .then(function (text) {
        content.innerHTML =
          typeof marked !== "undefined"
            ? marked.parse(text)
            : "<pre style=\"white-space:pre-wrap\">" + escapeHtml(text) + "</pre>";
      })
      .catch(function (err) {
        content.innerHTML =
          '<div style="color:var(--red); border:1px dashed var(--red); padding:12px; border-radius:8px;">' +
          "No se ha podido cargar el README.md (" + err.message + ")." +
          "</div>";
      });
  }

  function setupCustomUpload() {
    var uploadBtn = document.getElementById("customUploadBtn");
    var uploadInput = document.getElementById("customUploadInput");
    var promptBtn = document.getElementById("customPromptBtn");
    var readmeBtn = document.getElementById("readmeBtn");

    if (uploadBtn && uploadInput) {
      uploadBtn.addEventListener("click", function () {
        uploadInput.value = "";
        uploadInput.click();
      });
      uploadInput.addEventListener("change", function () {
        var file = uploadInput.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function () {
          var data;
          try {
            data = JSON.parse(reader.result);
          } catch (e) {
            alert("El archivo no es un JSON válido: " + e.message);
            return;
          }
          var errors = validateCustomTemaJSON(data);
          if (errors.length) {
            alert(
              "El archivo no tiene el formato esperado:\n\n- " +
                errors.join("\n- ") +
                "\n\nRevisa el botón \"Cómo preparar tus preguntas\" y vuelve a intentarlo."
            );
            return;
          }
          var normalized = {
            tema_id: uniqueTemaId(data.tema),
            tema: data.tema.trim(),
            orden: 0,
            test: data.test || [],
            redaccion: Array.isArray(data.redaccion) ? data.redaccion : [],
            createdAt: Date.now(),
          };
          window.ExamStorage.saveCustomModule(normalized);
          rebuildAsignaturas();
          updateHeroCount();
          renderSubjects();
          renderGlobalStat();
          updateStartBar();
          document.querySelectorAll(".subject").forEach(function (s) {
            if (s.dataset.slug === CUSTOM_SLUG) s.classList.add("open");
          });
          alert(
            'Añadido. El módulo "' + normalized.tema + '" ya está dentro de "Mis preguntas" (' +
              normalized.test.length + " preguntas de test, " + normalized.redaccion.length + " de redacción)."
          );
        };
        reader.onerror = function () {
          alert("No se ha podido leer el archivo.");
        };
        reader.readAsText(file);
      });
    }

    if (promptBtn) promptBtn.addEventListener("click", openPromptModal);
    setupPromptModal();
    if (readmeBtn) readmeBtn.addEventListener("click", toggleReadme);
  }
})();