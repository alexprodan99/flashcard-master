import { contextBridge } from "electron";

export interface DesktopBridge {
  isDesktop: boolean;
  platform: string;
  version: string;
}

const desktopBridge: DesktopBridge = {
  isDesktop: true,
  platform: process.platform,
  version: "1.0.0",
};

contextBridge.exposeInMainWorld("desktopApp", desktopBridge);
