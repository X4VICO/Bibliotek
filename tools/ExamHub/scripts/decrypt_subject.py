#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
decrypt_subject.py — Descifra de vuelta a JSON plano los temas cifrados de
una asignatura, para poder editarlos. Vuelve a cifrarlos después con
encrypt_subject.py (usando la misma o distinta contraseña).

Uso:
    python3 scripts/decrypt_subject.py data/cyberops-associate
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
from cryptography.exceptions import InvalidTag


def derive_key(password, salt, iterations):
    kdf = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=iterations)
    return kdf.derive(password.encode("utf-8"))


def descifrar_archivo(ruta, password):
    with open(ruta, encoding="utf-8") as f:
        data = json.load(f)

    if not data.get("encrypted"):
        print(f"  [saltado] {ruta} no está cifrado")
        return False

    salt = base64.b64decode(data["salt"])
    iv = base64.b64decode(data["iv"])
    ciphertext = base64.b64decode(data["ciphertext"])
    key = derive_key(password, salt, data.get("kdf_iterations", 250_000))

    try:
        plano = AESGCM(key).decrypt(iv, ciphertext, None)
    except InvalidTag:
        print(f"  [error] {ruta}: contraseña incorrecta")
        return None

    payload = json.loads(plano.decode("utf-8"))

    nueva = {
        "asignatura": data["asignatura"],
        "asignatura_slug": data["asignatura_slug"],
        "tema": data["tema"],
        "tema_id": data["tema_id"],
        "orden": data.get("orden", 0),
        "test": payload["test"],
        "redaccion": payload["redaccion"],
    }

    with open(ruta, "w", encoding="utf-8") as f:
        json.dump(nueva, f, ensure_ascii=False, indent=2)

    print(f"  [ok] {ruta} descifrado")
    return True


def main():
    ap = argparse.ArgumentParser(description="Descifra los temas .json de una asignatura")
    ap.add_argument("carpeta", help="carpeta dentro de data/, p.ej. data/cyberops-associate")
    ap.add_argument("--password")
    args = ap.parse_args()

    if not os.path.isdir(args.carpeta):
        print(f"No existe la carpeta: {args.carpeta}")
        sys.exit(1)

    password = args.password or getpass.getpass("Contraseña: ")

    archivos = [
        os.path.join(args.carpeta, f)
        for f in sorted(os.listdir(args.carpeta))
        if f.endswith(".json") and f != "manifest.json"
    ]

    print(f"Descifrando {len(archivos)} archivo(s) en {args.carpeta}...\n")
    resultados = [descifrar_archivo(a, password) for a in archivos]
    if any(r is None for r in resultados):
        print("\nContraseña incorrecta en al menos un archivo — revisa antes de seguir.")
        sys.exit(1)
    n = sum(1 for r in resultados if r)
    print(f"\nListo: {n} archivo(s) descifrado(s) a JSON plano.")
    print("Recuerda NO subir estos archivos en plano si vas a hacer commit —")
    print("vuelve a cifrarlos con encrypt_subject.py antes de git push.")
    print("Ejecuta también: python3 scripts/build_manifest.py")


if __name__ == "__main__":
    main()
