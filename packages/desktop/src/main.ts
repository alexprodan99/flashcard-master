import { app, BrowserWindow, Tray, Menu, nativeImage, dialog } from "electron";
import type { AppUpdater } from "electron-updater";
import electronUpdaterPkg from "electron-updater";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { bootstrapDesktopServer, type DesktopBootstrapResult } from "./bootstrap.js";

const autoUpdater: AppUpdater =
  (electronUpdaterPkg as any)?.autoUpdater ??
  (electronUpdaterPkg as any)?.default?.autoUpdater ??
  electronUpdaterPkg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let bootstrapResult: DesktopBootstrapResult | null = null;
let isQuitting = false;

function resolveAssetPath(filename: string): string {
  const possiblePaths = [
    path.join(__dirname, "assets", filename),
    path.join(__dirname, "..", "assets", filename),
    path.join(process.cwd(), "packages", "desktop", "assets", filename),
    path.join(process.cwd(), "assets", filename),
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }
  return possiblePaths[0];
}

export function createDesktopWindow(url: string): BrowserWindow {
  const iconPath = resolveAssetPath("icon.png");
  const preloadPath = path.join(__dirname, "preload.js");

  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    title: "Flashcard Master",
    backgroundColor: "#0f172a",
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    show: false,
    webPreferences: {
      preload: fs.existsSync(preloadPath) ? preloadPath : undefined,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.loadURL(url);

  win.once("ready-to-show", () => {
    win.show();
  });

  win.on("close", (event) => {
    if (!isQuitting) {
      event.preventDefault();
      win.hide();
    }
  });

  return win;
}

export function setupSystemTray(win: BrowserWindow): Tray | null {
  const iconPath = resolveAssetPath("icon.png");
  if (!fs.existsSync(iconPath)) {
    return null;
  }

  let icon = nativeImage.createFromPath(iconPath);
  if (process.platform === "darwin") {
    icon = icon.resize({ width: 16, height: 16 });
  } else {
    icon = icon.resize({ width: 24, height: 24 });
  }

  const sysTray = new Tray(icon);
  sysTray.setToolTip("Flashcard Master");

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Open Flashcard Master",
      click: () => {
        if (win.isMinimized()) win.restore();
        win.show();
        win.focus();
      },
    },
    {
      label: "Minimize to Tray",
      click: () => {
        win.hide();
      },
    },
    { type: "separator" },
    {
      label: "Quit",
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  sysTray.setContextMenu(contextMenu);

  sysTray.on("double-click", () => {
    if (win.isMinimized() || !win.isVisible()) {
      win.show();
      win.restore();
    }
    win.focus();
  });

  return sysTray;
}

export function setupAutoUpdater(win?: BrowserWindow | null): void {
  // Only check for updates when packaged, or if forced via environment
  if (!app.isPackaged && process.env.ELECTRON_FORCE_UPDATE_CHECK !== "true") {
    return;
  }

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("checking-for-update", () => {
    console.log("[AutoUpdater] Checking for updates...");
  });

  autoUpdater.on("update-available", (info) => {
    console.log("[AutoUpdater] Update available:", info.version);
    if (win && !win.isDestroyed()) {
      win.webContents.send("app-update-available", {
        version: info.version,
        releaseDate: info.releaseDate,
        releaseNotes: info.releaseNotes,
      });
    }

    dialog.showMessageBox(win ?? (null as any), {
      type: "info",
      title: "Update Available",
      message: `A new version of Flashcard Master (v${info.version}) is available.`,
      detail: "Would you like to download and install it now?",
      buttons: ["Download & Restart", "Later"],
      defaultId: 0,
      cancelId: 1,
    }).then(({ response }) => {
      if (response === 0) {
        autoUpdater.downloadUpdate().catch((err) => {
          console.error("[AutoUpdater] Download failed:", err);
        });
      }
    });
  });

  autoUpdater.on("update-downloaded", () => {
    dialog.showMessageBox(win ?? (null as any), {
      type: "info",
      title: "Update Ready",
      message: "The new version has been downloaded. Restart Flashcard Master now to apply the update.",
      buttons: ["Restart Now", "Later"],
      defaultId: 0,
      cancelId: 1,
    }).then(({ response }) => {
      if (response === 0) {
        autoUpdater.quitAndInstall();
      }
    });
  });

  autoUpdater.on("error", (err) => {
    console.error("[AutoUpdater] Error in auto-updater:", err);
  });

  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((err) => {
      console.warn("[AutoUpdater] Check for updates failed:", err.message);
    });
  }, 3000);
}

async function startApplication(): Promise<void> {
  try {
    const userDataPath = app.getPath("userData");
    bootstrapResult = await bootstrapDesktopServer({ userDataPath });

    mainWindow = createDesktopWindow(bootstrapResult.url);
    tray = setupSystemTray(mainWindow);
    setupAutoUpdater(mainWindow);

    const isSmokeTest = process.argv.includes("--smoke-test") || process.env.ELECTRON_SMOKE_TEST === "1";
    if (isSmokeTest) {
      console.log("[SmokeTest] Desktop app booted successfully. Exiting cleanly.");
      setTimeout(() => {
        isQuitting = true;
        app.exit(0);
      }, 1000);
    }
  } catch (err: any) {
    dialog.showErrorBox("Startup Error", `Failed to initialize Flashcard Master:\n${err.message}`);
    app.quit();
  }
}

// Enforce single instance lock (bypassed in smoke test)
const isSmokeTest = process.argv.includes("--smoke-test") || process.env.ELECTRON_SMOKE_TEST === "1";
const hasLock = isSmokeTest || app.requestSingleInstanceLock();

if (!hasLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    await startApplication();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0 && bootstrapResult) {
        mainWindow = createDesktopWindow(bootstrapResult.url);
      } else if (mainWindow) {
        mainWindow.show();
        mainWindow.focus();
      }
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit();
    }
  });

  app.on("before-quit", async () => {
    isQuitting = true;
    if (bootstrapResult) {
      try {
        await bootstrapResult.close();
      } catch (err) {
        console.error("Error closing desktop server on quit:", err);
      }
    }
  });
}
