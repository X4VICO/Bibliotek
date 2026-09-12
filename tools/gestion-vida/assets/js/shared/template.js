// Genera la plantilla Excel en blanco (con una fila de ejemplo por hoja) para toda la suite.
function gvDownloadFullTemplate() {
  const sheets = [
    {
      name: 'Garaje - Gastos',
      rows: [{
        'Vehículo': 'Ford Focus',
        'Categoría': 'Mantenimiento',
        'Descripción': 'EJEMPLO - Cambio de aceite (borra esta fila)',
        'Coste (€)': 48,
        'Fecha inicio': '2025-08-14',
        'Fecha final': '',
        'Kilometraje': '188.821 km',
        'Proveedor / Link': 'MADA',
        'Notas': ''
      }]
    },
    {
      name: 'Garaje - Vehículos',
      rows: [{
        'Vehículo': 'Ford Focus',
        'Marca / Modelo': 'Ford Focus 1.5 TDCi',
        'Matrícula': '',
        'Neumáticos': 'R17',
        'Batería': '60 Ah',
        'Aceite': '3L',
        'Fecha alta': '2021-06-23',
        'Notas': 'EJEMPLO (borra esta fila)'
      }]
    },
    {
      name: 'Inventario',
      rows: [{
        'Categoría': 'Dispositivo',
        'Artículo': 'EJEMPLO - Portátil (borra esta fila)',
        'Marca / Modelo': 'MSI GF63 Thin 9SC',
        'Fecha compra': '2019-10-28',
        'Precio (€)': 898,
        'Vendedor / Tienda': 'Amazon',
        'Garantía (meses)': 36,
        'Estado': 'Activo',
        'Observaciones': ''
      }]
    },
    {
      name: 'Deudas',
      rows: [{
        'Asunto': 'EJEMPLO - Préstamo (borra esta fila)',
        'Deudor': 'Mama',
        'Cantidad (€)': 100,
        'Fecha inicio': '2025-01-01',
        'Fecha final': '',
        'Pagado': 'FALSE',
        'Notas': ''
      }]
    },
    {
      name: 'Vida Laboral',
      rows: [{
        'Empresa': 'EJEMPLO - Empresa S.L. (borra esta fila)',
        'Puesto': 'Técnico',
        'Fecha inicio': '2024-01-01',
        'Fecha final': '',
        'Tipo de contrato': 'Jornada Completa',
        'Modalidad': 'Presencial',
        'Notas': ''
      }]
    }
  ];
  GV_IO.downloadWorkbook(sheets, 'plantilla-gestion-de-vida.xlsx');
}
