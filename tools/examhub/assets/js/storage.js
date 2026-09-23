// storage.js — estadísticas de práctica persistidas en localStorage.
// Clave de pregunta = `${tema_file}#t${index}` (estable mientras no reordenes
// las preguntas dentro de un archivo de tema).
(function (global) {
  "use strict";
  var STORE_KEY = "examhub_stats_v1";

  function load() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  function save(stats) {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(stats));
    } catch (e) {
      /* almacenamiento no disponible (modo privado, cuota, etc.) */
    }
  }

  var stats = load();

  function record(qid, correct) {
    var s = stats[qid] || { seen: 0, correct: 0, lastWrong: false };
    s.seen++;
    if (correct) {
      s.correct++;
      s.lastWrong = false;
    } else {
      s.lastWrong = true;
    }
    stats[qid] = s;
    save(stats);
  }

  function get(qid) {
    return stats[qid] || null;
  }

  function all() {
    return stats;
  }

  function globalAccuracy() {
    var ids = Object.keys(stats);
    if (ids.length === 0) return null;
    var correct = 0,
      seen = 0;
    ids.forEach(function (id) {
      correct += stats[id].correct;
      seen += stats[id].seen;
    });
    return { seenQuestions: ids.length, pct: seen ? Math.round((correct / seen) * 100) : 0 };
  }

  // ---------- borrado parcial de progreso ----------

  function clearQuestion(qid) {
    if (!(qid in stats)) return false;
    delete stats[qid];
    save(stats);
    return true;
  }

  // Borra todas las entradas cuyo id empiece por `${file}#` (todas las
  // preguntas de un tema concreto, sin tocar el resto).
  function clearTema(file) {
    var prefix = file + "#";
    var changed = false;
    Object.keys(stats).forEach(function (id) {
      if (id.indexOf(prefix) === 0) {
        delete stats[id];
        changed = true;
      }
    });
    if (changed) save(stats);
    return changed;
  }

  // Borra el progreso de varios temas a la vez (p. ej. todos los temas de
  // una asignatura).
  function clearFiles(files) {
    var prefixes = (files || []).map(function (f) { return f + "#"; });
    var changed = false;
    Object.keys(stats).forEach(function (id) {
      for (var i = 0; i < prefixes.length; i++) {
        if (id.indexOf(prefixes[i]) === 0) {
          delete stats[id];
          changed = true;
          break;
        }
      }
    });
    if (changed) save(stats);
    return changed;
  }

  function clearAll() {
    stats = {};
    save(stats);
  }

  // ---------- exportar / importar progreso (portable, sin cuentas) ----------

  function exportJSON() {
    return JSON.stringify(
      { app: "examhub", version: 1, exportedAt: new Date().toISOString(), stats: stats },
      null,
      2
    );
  }

  // mode: "merge" (por defecto, combina con lo que ya haya) o "replace"
  // (sustituye todo el progreso actual por el del archivo importado).
  function importJSON(json, mode) {
    var data;
    try {
      data = typeof json === "string" ? JSON.parse(json) : json;
    } catch (e) {
      throw new Error("el archivo no es un JSON válido");
    }
    var incoming = data && typeof data === "object" && data.stats ? data.stats : data;
    if (!incoming || typeof incoming !== "object" || Array.isArray(incoming)) {
      throw new Error("el archivo no tiene el formato de progreso de ExamHub");
    }

    if (mode === "replace") {
      stats = incoming;
    } else {
      // Combinar: para cada pregunta nos quedamos con el registro que tenga
      // más intentos (`seen`), asumiendo que es el más "avanzado". No hay
      // marca de tiempo por pregunta, así que es una heurística razonable.
      Object.keys(incoming).forEach(function (qid) {
        var inc = incoming[qid];
        var cur = stats[qid];
        if (!cur || (inc && inc.seen >= cur.seen)) {
          stats[qid] = inc;
        }
      });
    }
    save(stats);
  }

  // ---------- "Mis preguntas": temas subidos por el usuario (100% local) ----------
  // Cada módulo se guarda entero (test + redaccion) bajo su propia clave de
  // localStorage. Se identifican en el resto de la app con un "file" falso
  // ("local:<tema_id>") para poder reutilizar tal cual todo el código que ya
  // esperaba una ruta de archivo de /data (selección, progreso, export...).
  var CUSTOM_PREFIX = "examhub_custom_module_";
  var CUSTOM_FILE_PREFIX = "local:";

  function customFileId(temaId) {
    return CUSTOM_FILE_PREFIX + temaId;
  }

  function isCustomFile(file) {
    return typeof file === "string" && file.indexOf(CUSTOM_FILE_PREFIX) === 0;
  }

  function temaIdFromFile(file) {
    return isCustomFile(file) ? file.slice(CUSTOM_FILE_PREFIX.length) : null;
  }

  function saveCustomModule(temaData) {
    try {
      localStorage.setItem(CUSTOM_PREFIX + temaData.tema_id, JSON.stringify(temaData));
      return true;
    } catch (e) {
      return false;
    }
  }

  function getCustomModule(temaId) {
    try {
      var raw = localStorage.getItem(CUSTOM_PREFIX + temaId);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function deleteCustomModule(temaId) {
    localStorage.removeItem(CUSTOM_PREFIX + temaId);
    clearTema(customFileId(temaId));
  }

  function listCustomModules() {
    var out = [];
    for (var i = 0; i < localStorage.length; i++) {
      var key = localStorage.key(i);
      if (key && key.indexOf(CUSTOM_PREFIX) === 0) {
        try {
          var data = JSON.parse(localStorage.getItem(key));
          if (data && data.tema_id) out.push(data);
        } catch (e) {
          /* entrada corrupta: se ignora */
        }
      }
    }
    out.sort(function (a, b) { return (a.createdAt || 0) - (b.createdAt || 0); });
    return out;
  }

  function deleteAllCustomModules() {
    listCustomModules().forEach(function (m) { deleteCustomModule(m.tema_id); });
  }

  global.ExamStorage = {
    record: record,
    get: get,
    all: all,
    globalAccuracy: globalAccuracy,
    clearQuestion: clearQuestion,
    clearTema: clearTema,
    clearFiles: clearFiles,
    clearAll: clearAll,
    exportJSON: exportJSON,
    importJSON: importJSON,
    customFileId: customFileId,
    isCustomFile: isCustomFile,
    temaIdFromFile: temaIdFromFile,
    saveCustomModule: saveCustomModule,
    getCustomModule: getCustomModule,
    deleteCustomModule: deleteCustomModule,
    listCustomModules: listCustomModules,
    deleteAllCustomModules: deleteAllCustomModules,
  };
})(window);