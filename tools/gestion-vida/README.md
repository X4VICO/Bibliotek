# Gestión de Vida

Suite de apps estáticas (sin backend, sin cuentas) para llevar el control de cosas de la vida real: el garaje, el inventario de compras, las deudas y el historial laboral. Pensada para vivir dentro de Bibliotek, en `tools/gestion-vida/`.

## Cómo funciona

- **Todo es local.** No hay servidor ni base de datos: cada app guarda su información en el `localStorage` del navegador que estés usando. Si cambias de navegador o de equipo, no verás los mismos datos a menos que exportes e importes.
- **La fuente de verdad es un Excel (o CSV).** Cada app puede importar un archivo, y siempre puede exportar el estado actual a un archivo nuevo. Así tienes una copia de seguridad real fuera del navegador.
- **Al recargar la página no se pierde nada**: los datos quedan en `localStorage` hasta que los borres o cambies de navegador.

## Primeros pasos

1. Abre `index.html` (el hub) y pulsa **⬇ Descargar plantilla Excel**. Te descarga `plantilla-gestion-de-vida.xlsx` con una hoja por app y una fila de ejemplo (bórrala antes de rellenar la tuya).
2. Entra en la app que quieras usar (por ahora, **Garaje**) e importa ese Excel, o el que ya tuvieras, con el botón **Importar**.
3. Trabaja normalmente: añadir, editar y borrar se guarda solo, sin botones de "guardar".
4. De vez en cuando, pulsa **Exportar** y guarda el archivo en tu Drive/Dropbox/donde prefieras. Es tu copia de seguridad.

## Estructura de datos de Garaje

Hoja **"Garaje - Gastos"** (una fila = un gasto):

| Vehículo | Categoría | Descripción | Coste (€) | Fecha inicio | Fecha final | Kilometraje | Proveedor / Link | Notas |
|---|---|---|---|---|---|---|---|---|

`Fecha final` solo se rellena en gastos con vencimiento (ITV, seguro...): la app la usa para avisarte cuando esté por caducar.

Hoja **"Garaje - Vehículos"** (una fila = un vehículo, es opcional pero da la ficha lateral):

| Vehículo | Marca / Modelo | Matrícula | Neumáticos | Batería | Aceite | Fecha alta | Notas |
|---|---|---|---|---|---|---|---|

El nombre de `Vehículo` debe coincidir exactamente entre ambas hojas para que la app relacione los gastos con la ficha.

## Ver el CSV "bonito" en Excel

Si exportas en `.csv` en vez de `.xlsx`:

1. Abre Excel → pestaña **Datos** → **Desde texto/CSV** (mejor que hacer doble clic, así eliges bien la codificación).
2. Codificación: **UTF-8**. Delimitador: **coma**.
3. Una vez importado, selecciona la tabla y usa **Insertar → Tabla** para que quede con formato, filtros y bandas de color automáticas.
4. Para las columnas de fecha, selecciona la columna → **Formato de celdas → Fecha** (Excel a veces las deja como texto al venir de CSV).

Si puedes, mejor usa siempre `.xlsx`: ya viene con las hojas separadas y las fechas reconocidas, sin pasos extra.

## Próximas apps

`Inventario`, `Deudas` y `Vida Laboral` están como tarjetas "Próximamente" en el hub. Se construirán con el mismo patrón que Garaje (import/export + `localStorage`), reutilizando `assets/js/shared/`.
