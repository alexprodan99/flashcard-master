import path from "node:path";
import fs from "node:fs";
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
  close: () => Promise<void>;
}

export async function bootstrapDesktopServer(
  options: DesktopBootstrapOptions = {}
): Promise<DesktopBootstrapResult> {
  let dbPath: string | undefined;
  let mediaDir: string | undefined;

  if (options.userDataPath) {
    if (!fs.existsSync(options.userDataPath)) {
      fs.mkdirSync(options.userDataPath, { recursive: true });
    }
    dbPath = options.inMemory ? ":memory:" : path.join(options.userDataPath, "data.sqlite");
    mediaDir = options.inMemory ? undefined : path.join(options.userDataPath, "media");
    if (mediaDir && !fs.existsSync(mediaDir)) {
      fs.mkdirSync(mediaDir, { recursive: true });
    }
  }

  const appContext = createAppContext({
    dbPath,
    inMemory: options.inMemory,
    mediaDir,
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
    dbPath: dbPath || "",
    mediaDir: mediaDir || "",
    close: async () => {
      await server.close();
      appContext.close();
    },
  };
}
