#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
convert_legacy_py.py — Migra archivos de tema en formato Python antiguo
(TEMA / TEST / REDACCION) al nuevo esquema JSON usado por la web y por
el runner de terminal.

Uso:
    python scripts/convert_legacy_py.py temas/*.py biblioteca/*.py
    python scripts/convert_legacy_py.py temas/controlacces_m1.py

No borra los .py originales — solo escribe el JSON equivalente dentro
de data/<asignatura_slug>/<tema_id>.json. Puedes borrar los .py a mano
una vez compruebes que el JSON generado es correcto.
"""
import sys
import os
import re
import json
import importlib.util
import unicodedata

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(ROOT, "data")


def slugify(texto):
    texto = unicodedata.normalize("NFKD", texto).encode("ascii", "ignore").decode("ascii")
    texto = texto.lower().strip()
    texto = re.sub(r"[^a-z0-9]+", "-", texto)
    return texto.strip("-")


def cargar_modulo_py(ruta):
    nombre = os.path.basename(ruta)[:-3]
    spec = importlib.util.spec_from_file_location(nombre, ruta)
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


def convertir_test(test_legacy):
    out = []
    for p in test_legacy:
        opciones = [{"texto": texto, "correcta": bool(correcta)} for texto, correcta in p["opciones"]]
        out.append({
            "enunciado": p["enunciado"],
            "opciones": opciones,
            "explicacion": p.get("explicacion", ""),
        })
    return out


def convertir_redaccion(red_legacy):
    out = []
    for p in red_legacy:
        out.append({
            "titulo": p["titulo"],
            "enunciado": p["enunciado"],
            "puntos": p.get("puntos", 10),
        })
    return out


def convertir_archivo(ruta):
    modulo = cargar_modulo_py(ruta)
    if not all(hasattr(modulo, attr) for attr in ("TEMA", "TEST", "REDACCION")):
        print(f"  [saltado] {ruta} no define TEMA, TEST y REDACCION")
        return None

    tema_id = os.path.basename(ruta)[:-3]
    asignatura_nombre = modulo.TEMA.get("asignatura", "Sin asignatura")
    asignatura_slug = slugify(asignatura_nombre)

    data = {
        "asignatura": asignatura_nombre,
        "asignatura_slug": asignatura_slug,
        "tema": modulo.TEMA.get("nombre", tema_id),
        "tema_id": tema_id,
        "orden": modulo.TEMA.get("id", 0),
        "test": convertir_test(modulo.TEST),
        "redaccion": convertir_redaccion(modulo.REDACCION),
    }

    out_dir = os.path.join(DATA_DIR, asignatura_slug)
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, f"{tema_id}.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    rel = os.path.relpath(out_path, ROOT)
    print(f"  [ok] {ruta} -> {rel}  ({len(data['test'])} test, {len(data['redaccion'])} redacción)")
    return out_path


def main():
    archivos = sys.argv[1:]
    if not archivos:
        print("Uso: python scripts/convert_legacy_py.py <archivo1.py> [archivo2.py ...]")
        print("     python scripts/convert_legacy_py.py temas/*.py biblioteca/*.py")
        sys.exit(1)

    print(f"Convirtiendo {len(archivos)} archivo(s)...\n")
    convertidos = 0
    for ruta in archivos:
        if not ruta.endswith(".py") or os.path.basename(ruta).startswith("_"):
            continue
        try:
            if convertir_archivo(ruta):
                convertidos += 1
        except Exception as e:
            print(f"  [error] {ruta}: {e}")

    print(f"\nListo: {convertidos} tema(s) convertido(s) a JSON en /data.")
    print("Ahora ejecuta: python scripts/build_manifest.py")


if __name__ == "__main__":
    main()
