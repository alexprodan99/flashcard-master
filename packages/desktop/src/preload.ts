import { contextBridge } from "electron";

export interface DesktopBridge {
  isDesktop: boolean;
  platform: string;
  version: string;
}

const versionArg = process.argv.find((arg) => arg.startsWith("--fm-app-version="));
const resolvedVersion = versionArg ? versionArg.slice("--fm-app-version=".length) : "1.3.0";

const desktopBridge: DesktopBridge = {
  isDesktop: true,
  platform: process.platform,
  version: resolvedVersion,
};

contextBridge.exposeInMainWorld("desktopApp", desktopBridge);
