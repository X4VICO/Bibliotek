// Gestión del "archivo de trabajo" de cada app usando la File System Access API,
// con fallback a <input type="file"> / descarga de blob en navegadores sin soporte
// (Firefox y derivados como Zen, LibreWolf, Waterfox; también Safari).
//
// Importante: esta API solo existe en navegadores basados en Chromium (Chrome, Edge,
// Brave, Opera...). En el resto, "Guardar" siempre generará una descarga nueva porque
// el navegador no permite escribir sobre un archivo ya abierto. No hay forma de evitar
// esto desde el código: es una limitación de esos navegadores, no de la app.
const GV_FILE = (() => {

  const supported = 'showOpenFilePicker' in window;

  // opts: { types: [{description, accept:{mime:[ext]}}], accept: '.xlsx,.csv' (para el fallback) }
  async function open(opts = {}) {
    if (!supported) return openFallback(opts);
    const [handle] = await window.showOpenFilePicker({
      types: opts.types || [{ description: 'Archivo', accept: { '*/*': [] } }],
      excludeAcceptAllOption: false,
      multiple: false
    });
    const file = await handle.getFile();
    return { handle, name: file.name, file };
  }

  function openFallback(opts) {
    return new Promise((resolve, reject) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = opts.accept || '*';
      input.onchange = () => {
        const file = input.files[0];
        if (!file) { reject(new DOMException('cancelado', 'AbortError')); return; }
        resolve({ handle: null, name: file.name, file });
      };
      input.click();
    });
  }

  // content: ArrayBuffer | Blob | string
  async function save(handle, content) {
    const writable = await handle.createWritable();
    await writable.write(content);
    await writable.close();
  }

  // getContent: async (handle|null) => contenido a escribir. Recibe el handle ANTES de escribir
  // para que quien llama pueda leer lo que ya hay en el destino (por ejemplo, para fusionar hojas
  // en vez de sobrescribir todo el archivo).
  async function saveAs(getContent, suggestedName, opts = {}) {
    if (!supported) {
      const content = await getContent(null);
      downloadBlob(content, suggestedName, opts.mime);
      return { handle: null, name: suggestedName };
    }
    const handle = await window.showSaveFilePicker({
      suggestedName,
      types: opts.types || [{ description: 'Archivo', accept: { '*/*': [] } }]
    });
    const content = await getContent(handle);
    await save(handle, content);
    return { handle, name: handle.name };
  }

  function downloadBlob(content, filename, mime) {
    const blob = content instanceof Blob ? content : new Blob([content], { type: mime || 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  // ---- Recordar el archivo entre apps (para que "el mismo archivo" siga abierto al
  // cambiar de sección) usando IndexedDB, que sí admite guardar un FileSystemFileHandle
  // (localStorage no puede: solo guarda texto). Solo tiene sentido si la API está soportada.
  const DB_NAME = 'gv-files';
  const STORE = 'handles';
  const SHARED_KEY = 'shared-workbook';

  function idbOpen() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => { req.result.createObjectStore(STORE); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function rememberHandle(handle) {
    if (!supported || !handle) return;
    try {
      const db = await idbOpen();
      await new Promise((res, rej) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(handle, SHARED_KEY);
        tx.oncomplete = res;
        tx.onerror = () => rej(tx.error);
      });
    } catch (e) { /* algunos navegadores no permiten guardar handles en IndexedDB */ }
  }

  async function recallHandle() {
    if (!supported) return null;
    try {
      const db = await idbOpen();
      return await new Promise((res, rej) => {
        const tx = db.transaction(STORE, 'readonly');
        const req = tx.objectStore(STORE).get(SHARED_KEY);
        req.onsuccess = () => res(req.result || null);
        req.onerror = () => rej(req.error);
      });
    } catch (e) { return null; }
  }

  async function forgetHandle() {
    if (!supported) return;
    try {
      const db = await idbOpen();
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(SHARED_KEY);
    } catch (e) { /* nada que olvidar */ }
  }

  // 'granted' sin pedir nada al usuario (silencioso) | 'prompt' (hace falta un clic real) | 'denied'
  async function queryPermission(handle, mode = 'readwrite') {
    try { return await handle.queryPermission({ mode }); } catch (e) { return 'denied'; }
  }
  // Requiere que se llame desde un gesto real del usuario (p. ej. dentro de un onclick).
  async function requestPermission(handle, mode = 'readwrite') {
    try { return await handle.requestPermission({ mode }); } catch (e) { return 'denied'; }
  }

  return {
    supported, open, save, saveAs, downloadBlob,
    rememberHandle, recallHandle, forgetHandle, queryPermission, requestPermission
  };
})();