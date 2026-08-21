#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
encrypt_subject.py — Cifra el contenido (test + redacción) de los temas de
una asignatura con AES-256-GCM, usando una clave derivada de una contraseña
(PBKDF2-HMAC-SHA256, 250 000 iteraciones).

El resto de metadatos (asignatura, tema, nº de preguntas...) se quedan sin
cifrar para que la web pueda seguir mostrando el catálogo y los contadores
sin necesidad de contraseña — solo el enunciado/opciones/redacción quedan
ilegibles sin ella.

Uso:
    python3 scripts/encrypt_subject.py data/cyberops-associate
    (te pedirá la contraseña de forma oculta, dos veces para confirmar)

    python3 scripts/encrypt_subject.py data/cyberops-associate --password "miclave"
    (no recomendado: la contraseña queda en el historial de la terminal)

IMPORTANTE:
  - Guarda la contraseña en un sitio seguro (gestor de contraseñas). No hay
    forma de recuperar el contenido si la pierdes.
  - Este script SOBRESCRIBE los .json originales con la versión cifrada.
    Si quieres poder editarlos más adelante, guarda una copia en otro sitio
    (fuera del repo, o simplemente en un `git stash`/rama aparte) antes de
    cifrar, o usa `decrypt_subject.py` cuando necesites volver a editarlos.
  - Ejecuta después: python3 scripts/build_manifest.py
"""
import sys
import os
import json
import base64
import getpass
import argparse

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes

KDF_ITERATIONS = 250_000
SALT_BYTES = 16
IV_BYTES = 12


def derive_key(password, salt):
    kdf = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=KDF_ITERATIONS)
    return kdf.derive(password.encode("utf-8"))


def cifrar_archivo(ruta, password):
    with open(ruta, encoding="utf-8") as f:
        data = json.load(f)

    if data.get("encrypted"):
        print(f"  [saltado] {ruta} ya está cifrado")
        return False

    test = data.get("test", [])
    redaccion = data.get("redaccion", [])
    payload = json.dumps({"test": test, "redaccion": redaccion}, ensure_ascii=False).encode("utf-8")

    salt = os.urandom(SALT_BYTES)
    iv = os.urandom(IV_BYTES)
    key = derive_key(password, salt)
    ciphertext = AESGCM(key).encrypt(iv, payload, None)  # incluye el tag de autenticación al final

    nueva = {
        "encrypted": True,
        "kdf_iterations": KDF_ITERATIONS,
        "asignatura": data["asignatura"],
        "asignatura_slug": data["asignatura_slug"],
        "tema": data["tema"],
        "tema_id": data["tema_id"],
        "orden": data.get("orden", 0),
        "test_count": len(test),
        "redaccion_count": len(redaccion),
        "salt": base64.b64encode(salt).decode("ascii"),
        "iv": base64.b64encode(iv).decode("ascii"),
        "ciphertext": base64.b64encode(ciphertext).decode("ascii"),
    }

    with open(ruta, "w", encoding="utf-8") as f:
        json.dump(nueva, f, ensure_ascii=False, indent=2)

    print(f"  [ok] {ruta} cifrado ({nueva['test_count']} test, {nueva['redaccion_count']} redacción)")
    return True


def main():
    ap = argparse.ArgumentParser(description="Cifra los temas .json de una asignatura")
    ap.add_argument("carpeta", help="carpeta dentro de data/, p.ej. data/cyberops-associate")
    ap.add_argument("--password", help="contraseña (evita usarlo, mejor déjalo que te la pida oculta)")
    args = ap.parse_args()

    if not os.path.isdir(args.carpeta):
        print(f"No existe la carpeta: {args.carpeta}")
        sys.exit(1)

    password = args.password
    if not password:
        password = getpass.getpass("Contraseña para esta asignatura: ")
        confirmar = getpass.getpass("Repite la contraseña: ")
        if password != confirmar:
            print("Las contraseñas no coinciden. Nada cifrado.")
            sys.exit(1)
    if len(password) < 8:
        print("Aviso: la contraseña tiene menos de 8 caracteres, es fácil de reventar por fuerza bruta.")

    archivos = [
        os.path.join(args.carpeta, f)
        for f in sorted(os.listdir(args.carpeta))
        if f.endswith(".json") and f != "manifest.json"
    ]
    if not archivos:
        print("No hay archivos .json en esa carpeta.")
        sys.exit(1)

    print(f"Cifrando {len(archivos)} archivo(s) en {args.carpeta}...\n")
    n = sum(1 for a in archivos if cifrar_archivo(a, password))
    print(f"\nListo: {n} archivo(s) cifrado(s).")
    print("Ahora ejecuta: python3 scripts/build_manifest.py")


if __name__ == "__main__":
    main()
