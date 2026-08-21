# 🚩 0xFlag - CTF Command Generator

![Version](https://img.shields.io/badge/version-v1.0-brightgreen?style=flat-square)
![Status](https://img.shields.io/badge/status-Active%20Development-blueviolet?style=flat-square)
![Python](https://img.shields.io/badge/python-3.8+-blue?style=flat-square&logo=python&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-orange?style=flat-square)

> [!IMPORTANT]
> **Nota sobre el origen del proyecto:**
> Este repositorio es un **fork evolutivo** de un proyecto académico realizado originalmente en grupo para la asignatura de *Introducció a la Programació*.
> 
> Aunque la base v1.0 fue un esfuerzo conjunto, las nuevas versiones són mantenidas y desarrolladas actualmente de forma individual con el objetivo de ampliar sus funcionalidades, personalizar la arquitectura y adaptarla a casos de uso profesionales en CTFs reales.

---

## 📖 Descripción del Proyecto

**0xFlag** es una herramienta web diseñada para facilitar la vida a los jugadores de **Capture The Flag (CTF)** y estudiantes de ciberseguridad. 

En competiciones o auditorías, recordar la sintaxis exacta de cada herramienta (Nmap, Gobuster, TTY upgrades, etc.) añade una carga cognitiva innecesaria. Este proyecto soluciona ese problema ofreciendo una interfaz gráfica sencilla que **genera automáticamente los comandos complejos** basándose en los parámetros que el usuario necesita, permitiéndole centrarse en la estrategia y no en la memorización.

Su arquitectura fue diseñada desde el principio para ser **modular y totalmente personalizable**, permitiendo a cada usuario añadir sus propios diccionarios de ataque sin tocar el código fuente.

### 👥 Créditos y Autores Originales (v1.0)
El núcleo inicial de la aplicación fue desarrollado por:
* Xavier Conde
* Joel Díaz
* Oscar Ferre
* Gerard Soteras
* Adrià Trillo

---

## 🚀 Funcionalidades

Esta herramienta agiliza el proceso en CTFs dividiendo las herramientas en las fases clásicas de una intrusión:
### 🔍 Reconocimiento

- **Generador Nmap**: Crea comandos rápidos para escaneos TCP/UDP, detección de versiones y scripts de vulnerabilidades.
- **Discovery**: Generación de comandos para fuzzing web y descubrimiento de directorios (Gobuster, FFUF, Dirsearch).

### 💥 Explotación

- **Reverse Shell**: Generación reactiva e instantánea de Payloads (Bash, PHP, Python, Netcat) y Listeners listos para copiar.

### 🪜 Escalada / Post-Explotación

- **TTY**: Guía paso a paso interactiva para estabilizar una shell básica y convertirla en una terminal completamente funcional.

---

## 🛠️ Requisitos Previos

Para ejecutar este proyecto necesitas:

* **Python 3.8** o superior.
* **Pip** (Gestor de paquetes de Python).

---

## ⚙️ Instalación y Ejecución

Sigue estos pasos para desplegar la herramienta en tu entorno local:

### 1. Clonar el repositorio
```bash
git clone https://github.com/Pocahontas2025/0xFlag
cd 0xFlag
```

### 2. Instalar dependencias

El proyecto utiliza librerías externas para la gestión web. Instálalas con:

```bash
pip install -r requirements.txt
```

> [!NOTE]
> Librerias que contiene requirements.txt: flask y psutil

### 3. Ejecutar la aplicación

Lanza el servidor local ejecutando el punto de entrada principal:

```bash
python main.py
```

### 4. Acceder a la herramienta

Al ejecutar main.py, la terminal te mostrará las interfaces de red detectadas.

- Selecciona la interfaz de tu VPN (ej. tun0) para que sea accesible en la red del CTF.
- Selecciona localhost (127.0.0.1) si quieres mantener la herramienta privada.

Una vez iniciada, abre tu navegador y visita la dirección mostrada (por defecto):

```
http://127.0.0.1:5000
```

### 5. Vistazo general
Cuando abras la web, encontraras la página de inicio y acceso directo a las herramientas más usadas.
También dispones de una cabecera con desplegables que representan 3 de las grandes fases de un CTF.
Además cuentas con un historial de aquellos comandos que copies, puedas consultarlos en un futuro y una sección de configuración.

### 6. Configuración en la web
0xFlag te permite guardar  Tu IP, la del Objetivo y tu Interfaz Preferida para que siempre que uses la herramienta, sea lo más rápida y personal posible. 

---

## ⚙️ Personalización y Añadido de Comandos

**0xFlag** es extensible por diseño. Los comandos no están escritos en la aplicación, sino que se generan dinámicamente.

¿Quieres añadir tu escaneo favorito o una nueva técnica de TTY?

1. **Edita el archivo `generate_bins.py`**:
Abre el archivo en la raíz del proyecto. Verás los diccionarios de configuración (`tty_procedures`,`nmap_scans`, `discovery_tools`...).
2. **Añade tu entrada**:
Inserta tu comando siguiendo el formato `clave: valor`. Usa los marcadores `{ip}` o `{url}` donde corresponda.

Ejemplo para añadir un escaneo personalizado:

```python
"mi_scan_sigiloso": "nmap -sS -T2 -p- {ip} -oN scan_lento.txt"
```

3. **Regenera los binarios**:
Ejecuta el script para compilar tus cambios en los archivos `.bin` de la carpeta `data/`:

```bash
python generate_bins.py
```

4. **Reinicia la aplicación**:
Si tenías `main.py` corriendo, ciérralo y vuélvelo a abrir para que cargue los nuevos cambios.

> [!WARNING]
> **Sintaxis Python**: Asegúrate de poner las comas , al final de cada línea del diccionario y cerrar correctamente las comillas. Un error aquí impedirá que se generen los archivos.

---

## 📂 Estructura del Proyecto

El código sigue una arquitectura modular para facilitar la escalabilidad:

```text
0xFlag/
├── data/
│   ├── discovery_tools.bin
│   ├── nmap_scans.bin
│   ├── tty_procedures.bin
│   └── user_config.bin
├── logs/
│   └── history.txt
├── src/
│   ├── libraries/
│   │   ├── config_manager.py
│   │   ├── logger.py
│   │   ├── utils.py
│   │   └── __init__.py
│   ├── static/
│   │   ├── assets/
│   │   │   ├── 0xFlag_Logo.png
│   │   │   ├── 0xFlag_NoBkg.png
│   │   │   └── favicon.ico
│   │   ├── css/
│   │   │   └── styles.css
│   │   ├── js/
│   │   │   └── scripts.js
│   │   └── paletacolores.txt
│   ├── templates/
│   │   ├── base.html
│   │   ├── discovery.html
│   │   ├── history.html
│   │   ├── index.html
│   │   ├── nmap.html
│   │   ├── reverse.html
│   │   ├── settings.html
│   │   └── tty.html
│   └── app.py
├── generate_bins.py
├── main.py
├── README.md
└── requirements.txt
```

---

## 🛠️ Solución de Problemas (FAQ)

### ❌ Error al guardar la configuración ("Permission denied")
Si al intentar guardar tus ajustes en el apartado **Configuración** recibes un error o la aplicación se cierra, suele ser un problema de **permisos**.

**Causa:**
Probablemente ejecutaste la herramienta por primera vez usando `sudo` (root), lo que creó el archivo de guardado (`data/user_config.bin`) con permisos de administrador. Si ahora intentas ejecutarla como usuario normal, no tendrás permiso para sobrescribir ese archivo.

**Solución:**
Tienes dos opciones:
1.  **Ejecutar siempre con el mismo usuario** (recomendado usar usuario normal, no root, a menos que sea necesario).
2.  **Borrar el archivo de configuración bloqueado** para que se genere de nuevo con tu usuario actual:

```bash
sudo rm data/user_config.bin

```

### ❌ Error: ModuleNotFoundError: No module named 'flask'

El entorno no encuentra las librerías necesarias. Asegúrate de haberlas instalado correctamente:
1. Si usas un entorno virtual (recomendado), actívalo primero:

```bash
source venv/bin/activate  # Linux/Mac
# o
.\venv\Scripts\activate   # Windows
```

2. Instala las dependencias:
```bash
pip install -r requirements.txt
```