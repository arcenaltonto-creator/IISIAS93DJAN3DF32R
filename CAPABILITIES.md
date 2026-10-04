# 🛡️ DEFENDER Panel v2.0 - Capacidades

## ✅ Funcionalidades Implementadas

### 🎮 Tokens de Discord
- **Extracción completa** de tokens de Discord (todas las versiones)
- Soporta: Discord, Discord Canary, Discord PTB, Discord Development
- **Tokens encriptados**: Desencripta tokens con prefijo `dQw4w9WgXcQ:` usando AES-256-GCM
- **Tokens en navegadores**: Busca tokens guardados en Chrome, Edge, Brave, Opera
- **Validación**: Verifica que los tokens sean válidos decodificando el User ID

### 🌐 Contraseñas de Navegadores

#### ✅ Totalmente Soportado (v10/v11)
- Chrome (versiones antiguas)
- Brave
- Opera
- Navegadores Chromium sin App-Bound Encryption

#### ⚠️ Parcialmente Soportado (v20 - ABE)
- **Edge moderno** (2024+)
- **Chrome 127+**
- Estas versiones usan App-Bound Encryption (ABE)
- **Detección**: El panel identifica y marca contraseñas v20
- **Alternativa**: Sugiere al usuario exportar manualmente desde el navegador

### 🍪 Cookies
- Conteo de cookies por navegador y perfil
- Detección de múltiples perfiles (Default, Profile 1, Profile 2, Profile 3)

### 📱 Aplicaciones
- **Telegram**: Detección de carpeta tdata
- **Steam**: Extracción de loginusers.vdf

### 💻 Control Remoto
- Terminal remota (PowerShell)
- Explorador de archivos
- Captura de pantalla
- Screen streaming (2-10 FPS)
- Gestión de procesos
- Historial de navegadores
- Opciones troll (mensajes, mouse, teclado, etc.)

---

## 🔐 Formatos de Encriptación Soportados

| Formato | Soporte | Método |
|---------|---------|--------|
| **v10** | ✅ Completo | AES-256-GCM con master key de DPAPI |
| **v11** | ✅ Completo | AES-256-GCM con master key de DPAPI |
| **v20** | ⚠️ Detectado | Requiere inyección en proceso del navegador |
| **Discord encrypted** | ✅ Completo | AES-256-GCM con master key |
| **Discord plain** | ✅ Completo | Extracción directa |

---

## 📊 Estadísticas Actuales

### Navegadores Probados
- ✅ Google Chrome (hasta v126)
- ⚠️ Google Chrome (v127+) - ABE v20
- ✅ Microsoft Edge (hasta 2023)
- ⚠️ Microsoft Edge (2024+) - ABE v20
- ✅ Brave (todas las versiones probadas)
- ✅ Opera (todas las versiones probadas)

### Discord
- ✅ Discord Stable - Funcionando
- ✅ Discord Canary - Funcionando
- ✅ Discord PTB - Funcionando
- ✅ Discord Development - Funcionando

---

## 🚀 Cómo Usar

### Instalación
1. Ejecutar el servidor: `npm start` en `/server`
2. Abrir navegador en `http://localhost:3000`
3. Login: `admin` / `admin`

### Desplegar Agente
1. Copiar carpeta `DEFENDER-Agent-Distributable` al dispositivo objetivo
2. Ejecutar `defender-agent.exe`
3. El agente se conecta automáticamente al servidor

### Extraer Datos
1. Seleccionar dispositivo en el panel
2. Ir a pestaña "Accounts"
3. Clic en "🔄 Scan Accounts"
4. Esperar 5-10 segundos
5. Ver resultados en las categorías:
   - Discord Tokens
   - Navegadores (Cookies & Passwords)
   - Aplicaciones

---

## 💡 Limitaciones Conocidas

### App-Bound Encryption (v20)
Microsoft y Google introdujeron ABE en 2024 como protección contra malware. Las contraseñas v20:

- ❌ No se pueden desencriptar sin inyección de DLL
- ❌ Requieren acceso al proceso del navegador en ejecución
- ✅ El panel las **detecta** y marca claramente
- 💡 **Solución alternativa**: Pedir al usuario exportar desde el navegador

### Soluciones para v20
Si necesitas desencriptar v20, opciones:
1. Usar herramientas especializadas como [Chrome-App-Bound-Encryption-Decryption](https://github.com/xaitax/Chrome-App-Bound-Encryption-Decryption)
2. Lanzar navegador con remote debugging (`--remote-debugging-port=9222`)
3. Enfocarse en navegadores sin ABE (Firefox, Brave sin actualizar)

---

## 🛠️ Tecnologías Utilizadas

### Frontend
- HTML5, CSS3, JavaScript vanilla
- Socket.IO client
- JSON Web Tokens (JWT)

### Backend
- Node.js + Express
- Socket.IO server
- SQLite (sql.js)
- bcryptjs para passwords

### Agente
- Node.js standalone (compilado con pkg)
- PowerShell para operaciones de sistema
- node-screenshots para capturas
- Crypto nativo de Node.js para AES-GCM

---

## 📝 Notas de Seguridad

Este proyecto es **solo para fines educativos y de investigación**. 

⚠️ **Advertencia Legal**:
- No uses este software contra sistemas sin autorización explícita
- El acceso no autorizado a sistemas informáticos es ilegal
- Los autores no se responsabilizan del mal uso de esta herramienta

---

## 🔄 Versión Actual: v2.0

### Changelog

**v2.0** (Actual)
- ✅ Extracción completa de tokens de Discord
- ✅ Soporte para v10/v11 passwords
- ✅ Detección de formato v20 (ABE)
- ✅ Búsqueda en 4 versiones de Discord
- ✅ Búsqueda en 4 navegadores
- ✅ Múltiples perfiles por navegador
- ✅ Validación de tokens
- ✅ Interfaz mejorada con estadísticas

---

## 🎯 Estado del Proyecto

**Estado General**: ✅ Funcional y Estable

**Prioridades**:
- ✅ Tokens de Discord: 100% funcional
- ✅ Contraseñas v10/v11: 100% funcional
- ⚠️ Contraseñas v20: Detectado, requiere implementación adicional
- ✅ Control remoto: 100% funcional
- ✅ Explorador de archivos: 100% funcional

---

**Desarrollado por**: DEFENDER Group  
**Licencia**: MIT (solo uso educativo)  
**Última actualización**: 2026-04-10
