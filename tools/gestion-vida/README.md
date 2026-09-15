# Gestión de Vida

Suite de apps estáticas (sin backend, sin cuentas) para llevar el control de cosas de la vida real: el garaje, el inventario de compras, las deudas y el historial laboral. Vive dentro de Bibliotek, en `tools/gestion-vida/`.

**Estado:** Garaje ✅ · Inventario ✅ · Deudas ✅ · Vida Laboral ✅ — la suite está completa.

## Cómo funciona

- **Todo es local.** No hay servidor ni base de datos: cada app guarda su información en el `localStorage` del navegador mientras trabajas (por si recargas la página sin querer), y en un archivo **.xlsx** cuando tú decides guardar.
- **Un solo Excel para toda la suite (opcional).** Puedes usar un `.xlsx` distinto por app, o uno único con varias hojas (como la plantilla). Al guardar, cada app **solo toca sus propias hojas** y respeta el resto — así Garaje e Inventario pueden compartir el mismo archivo sin pisarse los datos.
- **El archivo activo sigue de una app a otra.** Si abres un archivo en Garaje y luego entras en Inventario, esta última se ofrece a reconectar con ese mismo archivo (aparece un aviso "🔗 Reconectar con..." arriba). Se guarda mediante IndexedDB, no en el archivo en sí.

## Primeros pasos

1. Abre `index.html` (el hub) y pulsa **⬇ Descargar plantilla Excel**: una hoja por app, con una fila de ejemplo (bórrala antes de rellenar la tuya).
2. Entra en la app que quieras usar y pulsa **📂 Abrir archivo (.xlsx)** para cargar esa plantilla (u otro Excel que ya tuvieras).
3. Trabaja normalmente: añadir, editar y borrar se autoguarda en el navegador al instante.
4. Pulsa **💾 Guardar** cuando quieras dejarlo escrito en el archivo de verdad (como Ctrl+S). Si nunca has abierto un archivo, "Guardar" te pedirá dónde crear uno ("Guardar como").

## Barra de archivo, botón a botón

- **📄 badge de estado**: nombre del archivo activo y si hay cambios sin guardar (`sin guardar` / `guardado`), o el aviso de reconexión si otra app dejó un archivo vinculado.
- **💾 Guardar**: escribe sobre el archivo activo sin preguntar nada (solo en Chrome/Edge/navegadores Chromium — ver más abajo). Si no hay archivo activo, actúa como "Guardar como".
- **Archivo ▾ → Abrir archivo (.xlsx)**: reemplaza los datos actuales por los del archivo elegido y lo deja como archivo activo.
- **Archivo ▾ → Guardar como (.xlsx)…**: guarda una copia en otra ubicación/nombre y la convierte en el nuevo archivo activo.
- **Archivo ▾ → Importar y combinar (Excel/CSV)**: trae datos de otro archivo sumándolos a los actuales (evita duplicados exactos), sin cambiar cuál es tu archivo activo. Útil para juntar el trabajo de dos equipos.
- **Archivo ▾ → Exportar a .csv**: una copia ligera de solo texto, sin tocar el archivo activo.
- **Archivo ▾ → Olvidar archivo vinculado**: desconecta el archivo activo (deja de intentar reconectar la próxima vez), sin borrar los datos que ya tengas cargados.

## Compatibilidad de navegador — importante

El flujo de "Guardar directo sobre el archivo" usa la **File System Access API**, que **solo existe en navegadores basados en Chromium**: Chrome, Edge, Brave, Opera...

**Firefox y sus derivados (Zen, LibreWolf, Waterfox) y Safari NO la soportan** — es una decisión deliberada de esos navegadores (Mozilla la considera un riesgo de seguridad), no una limitación de esta app, y no hay ningún código o workaround que lo arregle desde una página web normal.

En esos navegadores, la app degrada así, automáticamente:
- **Abrir** usa el selector de archivos de toda la vida (`<input type="file">`).
- **Guardar** y **Guardar como** siempre descargan una copia nueva a la carpeta de Descargas — no pueden escribir en el archivo original porque el navegador no lo permite.
- La reconexión automática entre apps (🔗) no está disponible, porque depende de recordar un identificador de archivo que tampoco existe en estos navegadores.

Nada de esto corrompe datos: simplemente, cada "Guardar" en Firefox/Zen/Safari es equivalente a un "Guardar como" con nombre repetido, así que puede que veas varias copias (`inventario.xlsx`, `inventario (1).xlsx`...) en Descargas. Si quieres el flujo sin descargas repetidas, necesitas un navegador Chromium para esta pestaña — el resto de la app (edición, gráficos, cálculos) funciona igual en cualquiera.

## Categorías, personas, tipos de contrato y otras "etiquetas"

En ninguna app son listas cerradas: categorías (Inventario), nombres de vehículo (Garaje), personas (Deudas) y tipo de contrato (Vida Laboral) son todos texto libre. Escribe uno nuevo al añadir/editar un registro y aparecerá como pestaña nueva automáticamente — no hace falta editar el Excel ni ningún archivo de configuración. Lo que ves sugerido al escribir es solo un autocompletado, no una restricción.

## Estructura de datos

### Garaje

Hoja **"Garaje - Gastos"** (una fila = un gasto):

| Vehículo | Categoría | Descripción | Coste (€) | Fecha inicio | Fecha final | Kilometraje | Proveedor / Link | Notas |
|---|---|---|---|---|---|---|---|---|

`Fecha final` solo se rellena en gastos con vencimiento (ITV, seguro...): la app la usa para avisarte cuando esté por caducar.

Hoja **"Garaje - Vehículos"** (una fila = un vehículo, opcional pero da la ficha lateral y el color de cada pestaña):

| Vehículo | Marca / Modelo | Matrícula | Neumáticos | Batería | Aceite | Fecha alta | Color | Notas |
|---|---|---|---|---|---|---|---|---|

El nombre de `Vehículo` debe coincidir exactamente entre ambas hojas para que la app relacione los gastos con la ficha.

### Inventario

Hoja **"Inventario"** (una fila = un artículo):

| Categoría | Artículo | Marca / Modelo | Fecha compra | Precio (€) | Vendedor / Tienda | Garantía (meses) | Estado | Fecha baja | Observaciones |
|---|---|---|---|---|---|---|---|---|---|

`Estado` es `Activo` o `De baja`. `Fecha baja` solo se rellena cuando pasa a "De baja" (se rompió, se vendió, se perdió...) — con esas dos fechas (compra y baja) la app calcula la **duración real** del artículo, que es el objetivo de esta herramienta. Si no rellenas `Fecha baja`, la app no puede calcular cuánto duró, solo cuánto lleva en uso.

### Deudas

Hoja **"Deudas"** (una fila = un movimiento):

| Asunto | Persona | Dirección | Cantidad (€) | Fecha inicio | Fecha límite | Pagado | Fecha pago | Notas |
|---|---|---|---|---|---|---|---|---|

`Dirección` es `Me deben` o `Yo debo` — se separó de `Persona` a propósito (en el Excel original venían mezclados en una sola columna, tipo "Yo a Mama", lo que hacía imposible agrupar bien por persona). `Pagado` es `TRUE`/`FALSE`; `Fecha pago` solo tiene sentido si `Pagado` es `TRUE`. `Fecha límite` es opcional y es lo que activa los avisos de vencimiento.

### Vida Laboral

Hoja **"Vida Laboral"** (una fila = una experiencia):

| Empresa | Puesto | Fecha inicio | Fecha final | Tipo de contrato | Modalidad | Notas |
|---|---|---|---|---|---|---|

`Fecha final` vacía significa "en curso" (tu empleo actual). La duración de cada experiencia y el total de tu trayectoria se calculan siempre en la app a partir de las fechas — no se guarda como columna, así se evita que quede desactualizada o rota (tu Excel original tenía un `#NUM!` en el puesto sin fecha fin, por calcularla con fórmula).

## Ver el CSV "bonito" en Excel

Si exportas en `.csv` en vez de `.xlsx`:

1. Abre Excel → pestaña **Datos** → **Desde texto/CSV** (mejor que hacer doble clic, así eliges bien la codificación).
2. Codificación: **UTF-8**. Delimitador: **coma**.
3. Una vez importado, selecciona la tabla y usa **Insertar → Tabla** para que quede con formato, filtros y bandas de color automáticas.
4. Para las columnas de fecha, selecciona la columna → **Formato de celdas → Fecha** (Excel a veces las deja como texto al venir de CSV).

Si puedes, mejor usa siempre `.xlsx`: ya viene con las hojas separadas y las fechas reconocidas, sin pasos extra.

## Sobre esta suite

Las cuatro apps comparten exactamente el mismo patrón: Abrir/Guardar/Guardar como en `.xlsx`, fusión de hojas para poder compartir un único Excel entre todas, reconexión automática de archivo entre apps, y autoguardado en `localStorage` mientras trabajas. Todo el código común vive en `assets/js/shared/` (`storage.js`, `io.js`, `filehandle.js`, `template.js`) — si en el futuro se añade una quinta app, reutiliza estos mismos módulos.