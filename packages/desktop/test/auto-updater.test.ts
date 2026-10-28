import { describe, it, expect, vi } from "vitest";

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
  it("initializes autoUpdater configuration and registers lifecycle event listeners", () => {
    setupAutoUpdater(null);

    expect(mockAutoUpdater.autoDownload).toBe(false);
    expect(mockAutoUpdater.autoInstallOnAppQuit).toBe(true);
    expect(mockAutoUpdater.on).toHaveBeenCalledWith("checking-for-update", expect.any(Function));
    expect(mockAutoUpdater.on).toHaveBeenCalledWith("update-available", expect.any(Function));
    expect(mockAutoUpdater.on).toHaveBeenCalledWith("update-downloaded", expect.any(Function));
    expect(mockAutoUpdater.on).toHaveBeenCalledWith("error", expect.any(Function));
  });
});
