# @flashcard-master/desktop

[![license](https://img.shields.io/badge/license-AGPL--3.0-blue.svg?style=flat-square)](https://github.com/alexprodan99/flashcard-master/blob/main/LICENSE)
[![docs](https://img.shields.io/badge/docs-GitHub%20Pages-green.svg?style=flat-square)](https://alexprodan99.github.io/flashcard-master/)
[![releases](https://img.shields.io/badge/downloads-GitHub%20Releases-orange.svg?style=flat-square)](https://github.com/alexprodan99/flashcard-master/releases)

Standalone, cross-platform desktop application for **Flashcard Master** packaged for Windows, macOS, and Linux.

---

## 📥 Download Desktop App

Pre-built native standalone installers and executables are available on the **[GitHub Releases Page](https://github.com/alexprodan99/flashcard-master/releases)**:

- **Windows**: [Flashcard.Master.Setup.1.0.0.exe](https://github.com/alexprodan99/flashcard-master/releases/download/v1.0.0/Flashcard.Master.Setup.1.0.0.exe) (NSIS Installer) or Portable `.exe`
- **macOS**: [Universal DMG](https://github.com/alexprodan99/flashcard-master/releases/download/v1.0.0/Flashcard.Master-1.0.0-universal.dmg), [Apple Silicon (arm64)](https://github.com/alexprodan99/flashcard-master/releases/download/v1.0.0/Flashcard.Master-1.0.0-arm64.dmg), [Intel (x64)](https://github.com/alexprodan99/flashcard-master/releases/download/v1.0.0/Flashcard.Master-1.0.0.dmg)
- **Linux**: [Flashcard.Master-1.0.0.deb](https://github.com/alexprodan99/flashcard-master/releases/download/v1.0.0/Flashcard.Master-1.0.0.deb) (Ubuntu / Debian) or [AppImage](https://github.com/alexprodan99/flashcard-master/releases/download/v1.0.0/Flashcard-Master-1.0.0.AppImage)

---

## 🛠️ Development & Building from Source

### Prerequisites
- Node.js 22+
- npm 10+

### Run Locally in Development
```bash
npm run desktop:start
```

### Package Native Binaries
```bash
# Package for current OS
npm run desktop:dist

# Package specific target
npm run --workspace=@flashcard-master/desktop dist:win
npm run --workspace=@flashcard-master/desktop dist:mac
npm run --workspace=@flashcard-master/desktop dist:linux
```

---

## 📄 License

GNU Affero General Public License v3.0 ([AGPL-3.0](https://github.com/alexprodan99/flashcard-master/blob/main/LICENSE)).
