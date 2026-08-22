# 🎓 ExamHub — Generador de Exámenes

Un hub web para practicar con preguntas tipo test y de redacción, organizado
por asignatura y tema. Pensado para ir creciendo curso a curso: cada apunte
nuevo es un archivo JSON dentro de `/data`, y aparece solo en la web sin
tocar código.

**Web:** funciona en el ordenador y en el móvil (es una página responsive
normal, sin instalación, sin backend).

> Demo local rápida: abre `index.html` con un servidor local (ver más abajo
> por qué no vale hacer doble clic) o publícalo con GitHub Pages.

---

## 📁 Estructura del proyecto

```
📦 ExamHub
 ┣ 📜 index.html              # Hub: elige asignaturas/temas y configura la sesión
 ┣ 📜 quiz.html                # Motor de examen (test + redacción)
 ┣ 📂 assets/
 ┃  ┣ 📂 css/style.css         # Sistema de diseño compartido
 ┃  ┗ 📂 js/
 ┃     ┣ hub.js                # Lógica del catálogo/selector
 ┃     ┣ quiz-engine.js        # Lógica de la sesión de examen
 ┃     ┗ storage.js            # Estadísticas en localStorage (aciertos/fallos)
 ┣ 📂 data/                    # 🟢 TODO el banco de preguntas vive aquí
 ┃  ┣ manifest.json            # Índice autogenerado — NO editar a mano
 ┃  ┣ 📂 <asignatura-slug>/
 ┃  ┃  ┗ <tema>.json           # Un archivo = un tema
 ┃  ┗ ...
 ┣ 📂 scripts/
 ┃  ┣ build_manifest.py        # Escanea data/ y regenera manifest.json
 ┃  ┗ convert_legacy_py.py     # Migra temas .py antiguos (TEMA/TEST/REDACCION) a JSON
 ┗ 📂 .github/workflows/
    ┗ build-manifest.yml       # Regenera el manifest solo al hacer push
```

**Una única fuente de datos.** Toda la web lee los JSON de `/data`. Ya no
existen `temas/` ni `biblioteca/` — su contenido quedó migrado a `/data`.

---

## 🚀 Cómo añadir un tema nuevo (lo del día a día)

1. Crea `data/<tu-asignatura>/<tema>.json` con este esquema:

    ```json
    {
      "asignatura": "Redes III",
      "asignatura_slug": "redes-iii",
      "tema": "Routing",
      "tema_id": "redes3_tema4",
      "orden": 4,
      "test": [
        {
          "enunciado": "¿Cuál es la máscara por defecto de una red clase C?",
          "opciones": [
            {"texto": "255.0.0.0", "correcta": false},
            {"texto": "255.255.0.0", "correcta": false},
            {"texto": "255.255.255.0", "correcta": true}
          ],
          "explicacion": "Opcional — se muestra en modo práctica al corregir."
        }
      ],
      "redaccion": [
        {"titulo": "OSPF vs RIP", "enunciado": "Compara ambos protocolos...", "puntos": 15}
      ]
    }
    ```

    - `asignatura_slug` agrupa temas de la misma asignatura — usa el mismo
      slug en todos los temas de esa asignatura (minúsculas, sin espacios ni
      tildes, guiones en vez de espacios).
    - `opciones`: cualquier número de opciones; puede haber **más de una
      correcta** (la web lo detecta sola y pide "elige N opciones").
    - `redaccion` es opcional — pon `[]` si el tema no tiene preguntas de
      desarrollo.
    - `explicacion` es opcional.

2. Regenera el catálogo:

    ```bash
    python3 scripts/build_manifest.py
    ```

    (valida el JSON y te avisa si falta alguna clave o si una pregunta no
    tiene ninguna opción correcta marcada)

3. `git add`, `commit`, `push`. Listo — aparece solo en la web.

    Si tienes activado el workflow de GitHub Actions incluido
    (`.github/workflows/build-manifest.yml`), ni siquiera necesitas el paso
    2: el manifest se regenera solo al hacer push. El script local sigue
    siendo útil para comprobar en tu máquina que el JSON está bien antes de
    subirlo.

### Preguntas de "emparejar" (opcional, avanzado)

Si una pregunta es de "empareja estos conceptos" y la representas con una
tabla o con una imagen de la respuesta, puedes usar:

```json
{ "enunciado": "...", "tipo": "matching_table", "opciones": [],
  "tabla": [["Concepto A", "Definición A"], ["Concepto B", "Definición B"]] }
```
```json
{ "enunciado": "...", "tipo": "matching_image", "opciones": [],
  "imagenes": ["https://.../pregunta.jpg", "https://.../respuesta.jpg"] }
```
La web muestra un botón "Mostrar respuesta".

### Migrar un tema antiguo (.py con TEMA/TEST/REDACCION)

```bash
python3 scripts/convert_legacy_py.py temas/tu_archivo.py
python3 scripts/build_manifest.py
```

---

## 🌐 Publicar con GitHub Pages

1. En el repo: **Settings → Pages → Source: Deploy from a branch → main → / (root)**.
2. Espera un minuto y tu web estará en `https://<usuario>.github.io/<repo>/`.
3. No necesitas build ni backend — es HTML/CSS/JS puro sirviendo JSON estático.

### Probarlo en local antes de publicar

Abrir `index.html` con doble clic **no funciona** (los navegadores bloquean
`fetch()` sobre `file://`). Levanta un servidor local en la carpeta del
proyecto:

```bash
python3 -m http.server 8000
# abre http://localhost:8000
```

---

## 📱 Uso en el móvil

Es una web responsive normal: ábrela con el navegador del móvil desde la
URL de GitHub Pages. En iOS/Android puedes "Añadir a pantalla de inicio"
desde el menú del navegador para que se abra como una app.

---

## 💾 Progreso y estadísticas

Cada pregunta de test que respondes se guarda en el `localStorage` del
navegador (aciertos/fallos, por pregunta). Con eso:

- El catálogo te muestra qué temas tienes más falladas.
- El botón **"Solo falladas anteriormente"** te arma una sesión solo con lo
  que fallaste la última vez.
- Es local al navegador — si cambias de dispositivo o borras datos del
  navegador, se pierde. No hay servidor ni cuentas de usuario.

Las preguntas de redacción no se corrigen solas: al terminar la sesión se
genera un bloque de texto descargable con todas tus respuestas para pegarlo
donde lo vayas a corregir.

---

## 🔒 Proteger una asignatura con contraseña (cifrado real)

Puedes cifrar el contenido de cualquier asignatura para que nadie pueda leer
las preguntas sin contraseña — ni viendo el código, ni bajando el JSON a
mano. Se cifra con **AES-256-GCM**, con la clave derivada de tu contraseña
mediante PBKDF2 (250 000 iteraciones). El descifrado ocurre en el propio
navegador de quien la usa, con la API nativa `crypto.subtle` — la
contraseña nunca sale del navegador ni se guarda en ningún sitio.

Necesitas la librería `cryptography` solo para estos dos scripts (el resto
del proyecto no tiene dependencias fuera de la librería estándar):

```bash
pip install -r requirements.txt
```

```bash
python3 scripts/encrypt_subject.py data/cyberops-associate
# te pide la contraseña (oculta, dos veces para confirmar)
python3 scripts/build_manifest.py
git add . && git commit -m "cifrar CyberOps" && git push
```

En la web, esa asignatura aparece con un candado 🔒. Al intentar hacer una
sesión con temas de ahí, sale un cuadro pidiendo la contraseña; si es
correcta, descifra en memoria y sigue como cualquier otra sesión. Si te
equivocas de contraseña, te avisa y te deja reintentar.

**Cosas a tener en cuenta:**
- Guarda la contraseña en un gestor de contraseñas — si la pierdes, el
  contenido cifrado es irrecuperable (no hay puerta trasera).
- Los metadatos (nombre de asignatura/tema, nº de preguntas) se quedan sin
  cifrar a propósito, para que el catálogo se pueda seguir mostrando sin
  contraseña. Solo el enunciado, las opciones y la redacción quedan
  ilegibles.
- Para volver a editar las preguntas más adelante, descífralas primero:

    ```bash
    python3 scripts/decrypt_subject.py data/cyberops-associate
    # edita los .json en texto plano
    python3 scripts/encrypt_subject.py data/cyberops-associate   # vuelve a cifrar
    python3 scripts/build_manifest.py
    ```
    No hagas commit de la versión descifrada por accidente — revisa
    `git diff` antes de subir.

---

## 🗂️ Scripts

| Script | Qué hace |
|---|---|
| `scripts/build_manifest.py` | Escanea `/data`, valida cada tema y genera `data/manifest.json` |
| `scripts/convert_legacy_py.py` | Convierte archivos `.py` del formato antiguo (`TEMA`/`TEST`/`REDACCION`) a JSON |
| `scripts/encrypt_subject.py` | Cifra con contraseña todos los temas de una asignatura (AES-256-GCM) |
| `scripts/decrypt_subject.py` | Descifra temporalmente una asignatura para poder editar sus preguntas |

---

## 🧩 Esquema completo de un archivo de tema

| Clave | Tipo | Obligatoria | Descripción |
|---|---|---|---|
| `asignatura` | string | sí | Nombre visible de la asignatura |
| `asignatura_slug` | string | sí | Slug estable — igual en todos los temas de esa asignatura |
| `tema` | string | sí | Nombre del tema, aparece en el selector |
| `tema_id` | string | sí | Identificador único del tema (usa el nombre del archivo, sin `.json`) |
| `orden` | number | no | Orden dentro de la asignatura (por defecto 0) |
| `test` | array | sí (puede ser `[]`) | Preguntas tipo test |
| `test[].enunciado` | string | sí | Texto de la pregunta |
| `test[].opciones` | array | sí (o `tipo` de emparejar) | `{texto, correcta}` — 1 o más `correcta: true` |
| `test[].explicacion` | string | no | Se muestra en modo práctica al corregir |
| `test[].tipo` | string | no | `matching_table` / `matching_image` para preguntas de emparejar |
| `test[].tabla` | array | solo si `tipo: matching_table` | Filas `[clave, valor]` |
| `test[].imagenes` | array | solo si `tipo: matching_image` (o como imagen normal de apoyo) | URLs de imagen |
| `redaccion` | array | sí (puede ser `[]`) | Preguntas de desarrollo |
| `redaccion[].titulo` | string | sí | Título corto |
| `redaccion[].enunciado` | string | sí | Enunciado completo |
| `redaccion[].puntos` | number | no | Puntuación máxima (por defecto 10) |

---

## Créditos

Basado en el runner de terminal original de este repo, ampliado a web
manteniendo el mismo formato de datos y añadiendo soporte multi-asignatura.