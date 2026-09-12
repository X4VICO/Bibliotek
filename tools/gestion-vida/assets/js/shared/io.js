// Import / export de Excel y CSV, común a toda la suite. Usa SheetJS (window.XLSX).
const GV_IO = (() => {

  function readWorkbookFromFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const wb = XLSX.read(e.target.result, { type: 'array', cellDates: true });
          resolve(wb);
        } catch (err) { reject(err); }
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(file);
    });
  }

  // Busca la primera hoja cuyo nombre contenga alguno de los "candidates" (case-insensitive).
  // Si no hay coincidencia, usa la primera hoja del libro.
  function findSheet(workbook, candidates) {
    const match = workbook.SheetNames.find(name =>
      candidates.some(c => name.toLowerCase().includes(c.toLowerCase()))
    );
    const name = match || workbook.SheetNames[0];
    return { name, sheet: workbook.Sheets[name] };
  }

  function sheetToRows(sheet) {
    if (!sheet) return [];
    return XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
  }

  function excelDateToISO(value) {
    if (!value) return '';
    if (value instanceof Date && !isNaN(value)) return value.toISOString().slice(0, 10);
    // Fallback: intenta parsear strings tipo dd/mm/yyyy o yyyy-mm-dd
    const s = String(value).trim();
    const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (iso) return s.slice(0, 10);
    const dmy = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/.exec(s);
    if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
    return '';
  }

  function toNumber(value) {
    if (value === '' || value === null || value === undefined) return null;
    const n = parseFloat(String(value).replace(',', '.'));
    return isNaN(n) ? null : n;
  }

  // sheets: [{ name, rows: [obj, obj...] }]
  function downloadWorkbook(sheets, filename) {
    const wb = XLSX.utils.book_new();
    sheets.forEach(s => {
      const ws = XLSX.utils.json_to_sheet(s.rows);
      // autosize aproximado
      const cols = Object.keys(s.rows[0] || {});
      ws['!cols'] = cols.map(c => ({ wch: Math.max(12, c.length + 2) }));
      XLSX.utils.book_append_sheet(wb, ws, s.name.substring(0, 31));
    });
    XLSX.writeFile(wb, filename);
  }

  function downloadCSV(rows, filename) {
    const ws = XLSX.utils.json_to_sheet(rows);
    const csv = XLSX.utils.sheet_to_csv(ws);
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  return { readWorkbookFromFile, findSheet, sheetToRows, excelDateToISO, toNumber, downloadWorkbook, downloadCSV };
})();
