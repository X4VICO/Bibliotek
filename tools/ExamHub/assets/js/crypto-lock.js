// crypto-lock.js — descifra en el navegador temas protegidos con contraseña
// (cifrados con scripts/encrypt_subject.py, AES-256-GCM + PBKDF2-SHA256).
// La contraseña nunca sale del navegador ni se guarda en disco: solo vive
// en memoria mientras dura la sesión de examen.
(function (global) {
  "use strict";

  function b64ToBytes(b64) {
    var bin = atob(b64);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  async function deriveKey(password, saltB64, iterations) {
    var salt = b64ToBytes(saltB64);
    var enc = new TextEncoder();
    var keyMaterial = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey(
      { name: "PBKDF2", salt: salt, iterations: iterations || 250000, hash: "SHA-256" },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false,
      ["decrypt"]
    );
  }

  // Intenta descifrar un tema cifrado. Devuelve {test, redaccion} o lanza
  // un error si la contraseña es incorrecta (fallo de autenticación GCM).
  async function decryptTema(encTema, password) {
    var key = await deriveKey(password, encTema.salt, encTema.kdf_iterations);
    var iv = b64ToBytes(encTema.iv);
    var ciphertext = b64ToBytes(encTema.ciphertext);
    var plainBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv }, key, ciphertext);
    var json = new TextDecoder().decode(plainBuf);
    return JSON.parse(json);
  }

  global.CryptoLock = { decryptTema: decryptTema };
})(window);
