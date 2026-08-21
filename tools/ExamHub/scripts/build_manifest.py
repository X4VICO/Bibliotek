#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build_manifest.py — Escanea data/ y genera data/manifest.json.

El manifest es el índice que lee la web (index.html) para saber qué
asignaturas y temas existen, sin tener que listar el contenido de la
carpeta desde el navegador (GitHub Pages no permite listar directorios).

Ejecútalo cada vez que añadas, borres o cambies un archivo JSON de
preguntas en /data. Si usas el workflow de GitHub Actions incluido
(.github/workflows/build-manifest.yml) esto se hace solo al hacer
push, así que en la práctica solo necesitas: crear el JSON, git push.

Uso:
    python scripts/build_manifest.py
"""
import os
import json
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(ROOT, "data")
MANIFEST_PATH = os.path.join(DATA_DIR, "manifest.json")

REQUIRED_KEYS = ("asignatura", "asignatura_slug", "tema", "tema_id", "test", "redaccion")
REQUIRED_KEYS_ENCRYPTED = ("asignatura", "asignatura_slug", "tema", "tema_id", "salt", "iv", "ciphertext")


def validar_tema(data, ruta):
    errores = []
    if data.get("encrypted"):
        for k in REQUIRED_KEYS_ENCRYPTED:
            if k not in data:
                errores.append(f"falta la clave '{k}' (tema cifrado)")
        for k in ("test_count", "redaccion_count"):
            if k not in data:
                errores.append(f"falta la clave '{k}' (necesaria para mostrar el catálogo sin descifrar)")
        return errores
    for k in REQUIRED_KEYS:
        if k not in data:
            errores.append(f"falta la clave '{k}'")
    for i, p in enumerate(data.get("test", [])):
        tipo = p.get("tipo", "opcion")
        if tipo in ("matching_table", "matching_image"):
            continue
        correctas = sum(1 for o in p.get("opciones", []) if o.get("correcta"))
        if correctas == 0:
            errores.append(f"test[{i}] no tiene ninguna opción marcada como correcta")
    return errores


def main():
    asignaturas = {}  # slug -> {"nombre":..., "temas":[...]}
    total_test = 0
    total_red = 0
    archivos_procesados = 0
    hubo_errores = False

    for dirpath, _dirnames, filenames in os.walk(DATA_DIR):
        for fname in sorted(filenames):
            if not fname.endswith(".json") or fname == "manifest.json":
                continue
            ruta = os.path.join(dirpath, fname)
            rel = os.path.relpath(ruta, ROOT).replace(os.sep, "/")
            try:
                with open(ruta, encoding="utf-8") as f:
                    data = json.load(f)
            except Exception as e:
                print(f"  [error] {rel}: JSON inválido ({e})")
                hubo_errores = True
                continue

            errores = validar_tema(data, ruta)
            if errores:
                print(f"  [error] {rel}:")
                for e in errores:
                    print(f"      - {e}")
                hubo_errores = True
                continue

            slug = data["asignatura_slug"]
            if slug not in asignaturas:
                asignaturas[slug] = {"slug": slug, "nombre": data["asignatura"], "temas": []}

            if data.get("encrypted"):
                n_test = data.get("test_count", 0)
                n_red = data.get("redaccion_count", 0)
            else:
                n_test = len(data.get("test", []))
                n_red = len(data.get("redaccion", []))

            asignaturas[slug]["temas"].append({
                "tema_id": data["tema_id"],
                "nombre": data["tema"],
                "orden": data.get("orden", 0),
                "file": rel,
                "test_count": n_test,
                "redaccion_count": n_red,
                "encrypted": bool(data.get("encrypted")),
            })
            total_test += n_test
            total_red += n_red
            archivos_procesados += 1
            print(f"  [ok] {rel}  ({n_test} test, {n_red} redacción)")

    if hubo_errores:
        print("\nHay errores en algunos archivos de tema. Corrígelos antes de publicar.")
        print("(el manifest se genera igualmente con los temas válidos)\n")

    lista_asignaturas = sorted(asignaturas.values(), key=lambda a: a["nombre"].lower())
    for a in lista_asignaturas:
        a["temas"].sort(key=lambda t: (t["orden"], t["nombre"]))

    manifest = {
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "asignaturas": lista_asignaturas,
        "totals": {
            "asignaturas": len(lista_asignaturas),
            "temas": archivos_procesados,
            "test": total_test,
            "redaccion": total_red,
        },
    }

    with open(MANIFEST_PATH, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)

    print(f"\nManifest generado: {len(lista_asignaturas)} asignatura(s), "
          f"{archivos_procesados} tema(s), {total_test} preguntas test, "
          f"{total_red} preguntas de redacción.")
    print(f"-> {os.path.relpath(MANIFEST_PATH, ROOT)}")


if __name__ == "__main__":
    main()
