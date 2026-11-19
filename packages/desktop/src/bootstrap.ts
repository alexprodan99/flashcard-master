import path from "node:path";
import fs from "node:fs";
import {
  getDefaultDatabasePath,
  getDefaultLocalFilesDirectory,
  getDefaultMediaDirectory,
} from "@flashcard-master/core";
import { createAppContext, type AppContext } from "@flashcard-master/cli";
import { createWebServer, type WebServer } from "@flashcard-master/web";

export interface DesktopBootstrapOptions {
  userDataPath?: string;
  port?: number;
  host?: string;
  inMemory?: boolean;
}

export interface DesktopBootstrapResult {
  appContext: AppContext;
  server: WebServer;
  port: number;
  url: string;
  dbPath: string;
  mediaDir: string;
  localFilesDir: string;
  close: () => Promise<void>;
}

export async function bootstrapDesktopServer(
  options: DesktopBootstrapOptions = {}
): Promise<DesktopBootstrapResult> {
  const normalizedUserData = options.userDataPath?.trim() || undefined;
  let dbPath: string | undefined;
  let mediaDir: string | undefined;
  let localFilesDir: string | undefined;

  if (normalizedUserData) {
    if (!options.inMemory && !fs.existsSync(normalizedUserData)) {
      fs.mkdirSync(normalizedUserData, { recursive: true });
    }
    dbPath = options.inMemory ? ":memory:" : path.join(normalizedUserData, "data.sqlite");
    mediaDir = path.join(normalizedUserData, "media");
    localFilesDir = path.join(normalizedUserData, "local-files");
    if (!options.inMemory) {
      if (!fs.existsSync(mediaDir)) {
        fs.mkdirSync(mediaDir, { recursive: true });
      }
      if (!fs.existsSync(localFilesDir)) {
        fs.mkdirSync(localFilesDir, { recursive: true });
      }
    }
  } else if (!options.inMemory) {
    // Unify Desktop directly onto ~/.flashcard-master/ without migrating legacy Electron userData
    dbPath = getDefaultDatabasePath();
    mediaDir = getDefaultMediaDirectory();
    localFilesDir = getDefaultLocalFilesDirectory();
  }

  const appContext = createAppContext({
    dbPath,
    inMemory: options.inMemory,
    mediaDir,
    localFilesDir,
  });

  const listenPort = options.port !== undefined ? options.port : 0;
  const host = options.host || "127.0.0.1";

  const server = createWebServer({
    port: listenPort,
    host,
    sourceRepo: appContext.sourceRepo,
    syncRepo: appContext.syncRepo,
    cardRepo: appContext.cardRepo,
    documentRepo: appContext.docRepo,
    jobRepo: appContext.jobRepo,
    settingsRepo: appContext.settingsRepo,
    settingsService: appContext.settingsService,
    providerVerifier: appContext.providerVerifier,
    mediaService: appContext.mediaService,
    mediaDir: appContext.mediaDir,
    localFilesDir: appContext.localFilesDir,
    ingestionService: appContext.ingestionService,
    exportService: appContext.exportService,
    ankiConnectAdapter: appContext.ankiConnectAdapter,
    strategyRegistry: appContext.strategyRegistry,
    promptBuilder: appContext.promptBuilder,
    groundingGuard: appContext.groundingGuard,
    dedupService: appContext.dedupService,
  });

  const { port, url } = await server.listen(listenPort);

  return {
    appContext,
    server,
    port,
    url,
    dbPath: dbPath || (options.inMemory ? ":memory:" : appContext.dbPath),
    mediaDir: mediaDir || appContext.mediaDir,
    localFilesDir: localFilesDir || appContext.localFilesDir,
    close: async () => {
      await server.close();
      appContext.close();
    },
  };
}
