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

  global.ExamStorage = { record: record, get: get, all: all, globalAccuracy: globalAccuracy };
})(window);
