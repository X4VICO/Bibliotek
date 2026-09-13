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

  async function saveAs(content, suggestedName, opts = {}) {
    if (!supported) {
      downloadBlob(content, suggestedName, opts.mime);
      return { handle: null, name: suggestedName };
    }
    const handle = await window.showSaveFilePicker({
      suggestedName,
      types: opts.types || [{ description: 'Archivo', accept: { '*/*': [] } }]
    });
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

  return { supported, open, save, saveAs, downloadBlob };
})();