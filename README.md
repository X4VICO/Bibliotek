<img src="assets/img/bibliotek.png" alt="Bibliotek Banner" width="40%" style="border-radius: 12px;">


# BIBLIOTEK

Un espacio centralizado de filosofía *open-source* creado para recopilar, estructurar y compartir herramientas, configuraciones y utilidades dinámicas enfocadas en **Ciberseguridad** y **Administración de Sistemas Informáticos en Red (ASIR)**.

https://x4vico.github.io/Bibliotek/

---

## **Características Clave**

* **Directorio Centralizado:** Acceso unificado a utilidades web, scripts y aplicaciones sin dispersión.
* **Búsqueda Dinámica:** Motor de filtrado en tiempo real para localizar rápidamente cualquier recurso.
* **Ecosistema Modular:** Diseñado como complemento directo a mi GitBook personal de documentación y tutoriales.
* **Ejecución Directa:** Integrado para funcionar desde el navegador mediante GitHub Pages.

---

## **Estructura del Proyecto**

La arquitectura está diseñada para facilitar la inclusión de nuevas herramientas de forma modular:

```text
bibliotek/
├── assets/
│   └── img/
│       └── bibliotek.png      # Assets visuales del proyecto
├── tools/                     # Carpetas independientes por cada herramienta
│   ├── tool-01/
│   └── tool-02/
├── registry.json              # Configuración y metadatos de las tarjetas
├── app.js                     # Lógica de renderizado, búsqueda y botones
├── index.html                 # Interfaz principal de la plataforma
└── style.css                  # Estilos del ecosistema

```

---

## **Gestión y Registro de Recursos**

Para añadir o modificar herramientas dentro de Bibliotek no es necesario alterar el maquetado base:

1. **Definir la tarjeta (`registry.json`):** Añade el objeto con la descripción, categoría, etiquetas y ruta correspondiente.
2. **Asignar la lógica (`app.js`):** Gestiona la generación de botones dinámicos y eventos de interacción.
3. **Añadir el contenido (`/tools/`):** Aloja los ficheros de la nueva herramienta en su carpeta dedicada dentro del directorio principal.

---

## **Despliegue y Uso**

### En la Web

Accede directamente a la versión desplegada en **GitHub Pages** sin necesidad de instalaciones previas.

### Ejecución Local

Si deseas probar o desarrollar herramientas localmente, puedes levantar un servidor HTTP rápido con Python:

```bash
# Clonar el repositorio
git clone [https://github.com/x4vico/bibliotek.git](https://github.com/x4vico/bibliotek.git)

# Acceder al directorio
cd bibliotek

# Iniciar servidor local
python3 -m http.server 8080

```

Navega a `http://localhost:8080` en tu navegador.

---

## **Stack Tecnológico**

El núcleo de la plataforma está construido con tecnologías web estándares (**HTML5**, **CSS3**, **JavaScript Vanilla**), mientras que cada módulo o herramienta alojada dentro de `/tools/` hace uso de sus propias tecnologías según su caso de uso (Python, Bash, APIs de ciberseguridad, etc.).

---

## **Licencia**

Este proyecto está distribuido bajo la licencia **MIT**. Consulta el archivo `LICENSE` para más detalles.
