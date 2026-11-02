# 🛡️ DEFENDER Panel - Advanced Remote Access Tool

A powerful, feature-rich Command & Control (C2) panel built with Node.js, designed for remote system administration and security research.

![Version](https://img.shields.io/badge/version-2.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)

---

## ⚠️ Legal Disclaimer

**FOR EDUCATIONAL AND AUTHORIZED SECURITY RESEARCH ONLY**

This software is intended exclusively for:
- Educational purposes
- Authorized penetration testing
- Security research with explicit written consent

**Unauthorized access to computer systems is illegal.** The authors assume zero liability for any misuse. By using this tool, you accept full responsibility and confirm you have explicit authorization for any systems accessed.

---

## ✨ Key Features

### 🎮 Credential Extraction
- **Discord Tokens** (Stable, Canary, PTB, Development)
  - Encrypted & plain text token extraction
  - Multi-client support
  - Browser storage scanning
- **Browser Passwords** (Chrome, Edge, Brave, Opera)
  - v10/v11 decryption (full support)
  - v20 detection (App-Bound Encryption)
  - Multi-profile support
- **Cookies & Session Data**
  - Cross-browser cookie extraction
  - Session hijacking capabilities
- **Application Data**
  - Telegram (tdata folder)
  - Steam (loginusers.vdf)

### 💻 Remote Control
- **Real-time Terminal** (PowerShell)
- **File Explorer** with upload/download
- **Process Manager** (view, filter, kill)
- **Screenshot Capture** (instant & scheduled)
- **Screen Streaming** (2-10 FPS adjustable)
- **Browser History** extraction
- **System Information** monitoring

### 🎯 Troll Features
- Custom message boxes
- Mouse & keyboard control
- Clipboard operations
- Audio playback
- Window manipulation

---

## 🚀 Quick Start

### Prerequisites
- **Node.js** >= 18.0.0
- **npm** or **yarn**
- **Windows** (for agent compilation)

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/yourusername/defender-panel.git
cd defender-panel
```

2. **Install server dependencies**
```bash
cd server
npm install
```

3. **Install agent dependencies**
```bash
cd ../agent
npm install
```

4. **Build the agent**
```bash
npm run build
```

5. **Start the server**
```bash
cd ../server
npm start
```

6. **Access the panel**
```
http://localhost:3000
Default credentials: admin / admin
```

---

## 📁 Project Structure

```
defender-panel/
├── server/                 # Backend server
│   ├── server.js          # Main server file
│   ├── auth.js            # Authentication logic
│   ├── public/            # Frontend files
│   │   ├── index.html     # Main UI
│   │   ├── css/           # Stylesheets
│   │   └── js/            # Client scripts
│   └── data/              # Database & screenshots
│       ├── panel.db       # SQLite database
│       └── screenshots/   # Captured images
│
├── agent/                  # Remote agent
│   ├── agent.js           # Agent source code
│   ├── config.json        # Agent configuration
│   └── defender-agent.exe # Compiled executable
│
├── DEFENDER-Agent-Distributable/  # Ready-to-deploy agent
│   ├── defender-agent.exe
│   ├── config.json
│   └── README.txt
│
└── docs/                   # Documentation
    ├── CAPABILITIES.md     # Feature documentation
    └── V20-PASSWORD-REALITY.md  # v20 encryption info
```

---

## 🔐 Security Features

### Encryption Formats Supported

| Format | Support | Method |
|--------|---------|--------|
| **v10** | ✅ Full | AES-256-GCM + DPAPI |
| **v11** | ✅ Full | AES-256-GCM + DPAPI |
| **v20** | ⚠️ Detected | Requires browser injection |
| **Discord encrypted** | ✅ Full | AES-256-GCM |
| **Discord plain** | ✅ Full | Direct extraction |

### Authentication
- JWT-based session management
- bcrypt password hashing
- Secure WebSocket communication

---

## 📊 Supported Platforms

### Agent
- ✅ Windows 10/11 (x64)
- ⚠️ Windows 7/8 (limited features)

### Server
- ✅ Windows
- ✅ Linux
- ✅ macOS
- ✅ Docker

### Browsers
- ✅ Google Chrome (all versions)
- ✅ Microsoft Edge (all versions)
- ✅ Brave
- ✅ Opera
- ✅ Chromium-based browsers

---

## 🛠️ Configuration

### Server Configuration
Edit `server/server.js`:
```javascript
const PORT = 3000;
const JWT_SECRET = 'your-secret-key';
```

### Agent Configuration
Edit `agent/config.json`:
```json
{
  "serverUrl": "http://your-server:3000",
  "reconnectInterval": 5000,
  "deviceName": "TARGET-PC"
}
```

---

## 📖 Usage Examples

### Extracting Discord Tokens
1. Select device in panel
2. Go to **Accounts** tab
3. Click **"🔄 Recopilar Datos"**
4. View extracted tokens in Discord section

### Remote Terminal
1. Select device
2. Go to **Terminal** tab
3. Enter PowerShell commands
4. View real-time output

### File Management
1. Select device
2. Go to **Archivos** tab
3. Navigate directories
4. Upload/download files

### Screen Monitoring
1. Select device
2. Go to **View Screen** tab
3. Adjust FPS (2-10)
4. Watch real-time screen

---

## 🔄 Deployment Options

### Option 1: Traditional Hosting
- **VPS** (DigitalOcean, Linode, Vultr)
- **Dedicated Server**
- Port forwarding + Dynamic DNS

### Option 2: Cloud Platforms
- **Railway** - Free tier available
- **Render** - Free tier with limitations
- **Fly.io** - Free allowance
- **Heroku** - Paid plans

### Option 3: Serverless
- **Vercel** - Frontend only
- **Netlify** - Frontend only
- Backend requires VPS

### Option 4: Tunneling Services
- **ngrok** - Quick testing
- **Cloudflare Tunnel** - Free, secure
- **LocalTunnel** - Free alternative

---

## 📦 Building Executable

The agent is compiled using **pkg**:

```bash
cd agent
npm run build
```

Output: `defender-agent.exe` (standalone, no Node.js required)

**Size:** ~45MB (includes Node.js runtime)

---

## 🐛 Known Limitations

### App-Bound Encryption (v20)
- Microsoft Edge & Chrome 127+ use v20 encryption
- Cannot decrypt without admin privileges
- **Workaround:** Manual browser export

### Antivirus Detection
- Some AVs may flag the agent as malicious
- Use obfuscation tools if needed
- Test in isolated environment first

---

## 🤝 Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit changes (`git commit -m 'Add AmazingFeature'`)
4. Push to branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📝 Changelog

### v2.0 (Current)
- ✅ Complete Discord token extraction
- ✅ Multi-browser password support
- ✅ v20 encryption detection
- ✅ Enhanced UI with real-time stats
- ✅ File explorer improvements
- ✅ Screen streaming optimization

### v1.0
- Initial release
- Basic remote control
- Terminal access
- File management

---

## 🔗 Resources

- [Documentation](./docs/CAPABILITIES.md)
- [v20 Encryption Info](./docs/V20-PASSWORD-REALITY.md)
- [Chrome ABE Research](https://github.com/xaitax/Chrome-App-Bound-Encryption-Decryption)

---

## 📧 Contact

- **GitHub:** [Your GitHub Profile]
- **Email:** [your-email@example.com]

---

## 📜 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

**Remember:** This is for educational purposes only. Always obtain proper authorization before testing.

---

## 🙏 Acknowledgments

- Chrome decryption research by [xaitax](https://github.com/xaitax)
- PowerShell integration techniques
- Node.js & Socket.IO community
- Security research community

---

## ⭐ Star History

If you find this project useful, please consider giving it a star!

---

**Built with ❤️ for cybersecurity education and research**
