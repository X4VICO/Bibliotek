# Planner semanal

Un planificador semanal minimalista para organizar tus bloques de tiempo en franjas de 30 minutos, con modo claro/oscuro y exportación a imagen para imprimir.

## Estructura del proyecto

```
Planner-semanal/
├── index.html              → Punto de entrada de la app
├── assets/
│   ├── css/
│   │   └── styles.css      → Estilos (tema claro y oscuro)
│   └── js/
│       └── app.js          → Lógica de la app (grid, eventos, guardado, exportación)
├── README.md
├── LICENSE
└── .gitignore
```

## Cómo usarlo en local

No requiere instalación ni dependencias. Simplemente abre `index.html` en tu navegador, o sirve la carpeta con un servidor estático:

```bash
# opción sencilla con Python
python3 -m http.server 8000
# luego visita http://localhost:8000
```

## Cómo publicarlo en GitHub Pages

1. Sube este contenido a tu repositorio `Planner-semanal` en GitHub (rama `main`).
2. Ve a **Settings → Pages**.
3. En "Build and deployment", elige **Deploy from a branch**, rama `main`, carpeta `/ (root)`.
4. Guarda. En un par de minutos tu planner estará disponible en `https://TU-USUARIO.github.io/Planner-semanal/`.

## Guardado de datos

La app guarda tu horario automáticamente en el `localStorage` del navegador cada vez que creas, editas o borras un bloque — no hace falta pulsar ningún botón de "guardar". Esto significa que:

- Los datos persisten aunque cierres la pestaña o el navegador.
- Los datos **se guardan por navegador y dispositivo**, no en la nube. Si abres la app desde otro ordenador o navegador, verás un horario vacío.
- Si borras el historial/datos de navegación de tu navegador, el horario se perderá.

Si en el futuro quieres sincronizar entre dispositivos, habría que añadir un backend (por ejemplo, una base de datos con autenticación); la estructura actual está pensada para funcionar sin servidor.

## Exportar como imagen

El botón de descarga genera un PNG en alta resolución del horario relleno, listo para imprimir, usando [html2canvas](https://github.com/niklasvh/html2canvas) (cargado desde CDN en `index.html`).
