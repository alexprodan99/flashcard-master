import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const { mockAutoUpdater } = vi.hoisted(() => {
  return {
    mockAutoUpdater: {
      autoDownload: true,
      autoInstallOnAppQuit: false,
      on: vi.fn(),
      checkForUpdates: vi.fn().mockResolvedValue(null),
    },
  };
});

vi.mock("electron", () => ({
  app: {
    isPackaged: true,
    getPath: vi.fn().mockReturnValue("/tmp"),
    requestSingleInstanceLock: vi.fn().mockReturnValue(true),
    whenReady: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
    quit: vi.fn(),
  },
  BrowserWindow: vi.fn(),
  Tray: vi.fn(),
  Menu: { buildFromTemplate: vi.fn() },
  nativeImage: { createFromPath: vi.fn().mockReturnValue({ resize: vi.fn() }) },
  dialog: { showMessageBox: vi.fn(), showErrorBox: vi.fn() },
}));

vi.mock("electron-updater", () => ({
  default: {
    autoUpdater: mockAutoUpdater,
  },
  autoUpdater: mockAutoUpdater,
}));

import { setupAutoUpdater } from "../src/main.js";

describe("Electron AutoUpdater (Epic 20 Action Item 1)", () => {
  const originalResourcesPath = process.resourcesPath;
  const originalForceUpdate = process.env.ELECTRON_FORCE_UPDATE_CHECK;
  let tempResourcesDir: string | null = null;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    delete process.env.ELECTRON_FORCE_UPDATE_CHECK;
  });

  afterEach(() => {
    vi.useRealTimers();
    Object.defineProperty(process, "resourcesPath", {
      value: originalResourcesPath,
      configurable: true,
    });
    if (originalForceUpdate === undefined) {
      delete process.env.ELECTRON_FORCE_UPDATE_CHECK;
    } else {
      process.env.ELECTRON_FORCE_UPDATE_CHECK = originalForceUpdate;
    }
    if (tempResourcesDir && fs.existsSync(tempResourcesDir)) {
      fs.rmSync(tempResourcesDir, { recursive: true, force: true });
      tempResourcesDir = null;
    }
  });

  it("initializes autoUpdater configuration and registers lifecycle event listeners", () => {
    setupAutoUpdater(null);

    expect(mockAutoUpdater.autoDownload).toBe(false);
    expect(mockAutoUpdater.autoInstallOnAppQuit).toBe(true);
    expect(mockAutoUpdater.on).toHaveBeenCalledWith("checking-for-update", expect.any(Function));
    expect(mockAutoUpdater.on).toHaveBeenCalledWith("update-available", expect.any(Function));
    expect(mockAutoUpdater.on).toHaveBeenCalledWith("update-downloaded", expect.any(Function));
    expect(mockAutoUpdater.on).toHaveBeenCalledWith("error", expect.any(Function));
  });

  it("skips checkForUpdates when app-update.yml is absent (e.g., unpacked --dir build)", () => {
    tempResourcesDir = fs.mkdtempSync(path.join(os.tmpdir(), "fm-no-updater-"));
    Object.defineProperty(process, "resourcesPath", {
      value: tempResourcesDir,
      configurable: true,
    });

    setupAutoUpdater(null);
    vi.advanceTimersByTime(3500);

    expect(mockAutoUpdater.checkForUpdates).not.toHaveBeenCalled();
  });

  it("runs checkForUpdates when app-update.yml exists in resourcesPath", () => {
    tempResourcesDir = fs.mkdtempSync(path.join(os.tmpdir(), "fm-with-updater-"));
    fs.writeFileSync(path.join(tempResourcesDir, "app-update.yml"), "provider: github\n");
    Object.defineProperty(process, "resourcesPath", {
      value: tempResourcesDir,
      configurable: true,
    });

    setupAutoUpdater(null);
    vi.advanceTimersByTime(3500);

    expect(mockAutoUpdater.checkForUpdates).toHaveBeenCalledTimes(1);
  });
});
