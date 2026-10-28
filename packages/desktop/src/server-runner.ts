import { bootstrapDesktopServer } from "./bootstrap.js";

async function run(): Promise<void> {
  const userDataPath = process.env.FLASHCARD_DESKTOP_USER_DATA || process.argv[2];
  const port = process.env.FLASHCARD_DESKTOP_PORT ? parseInt(process.env.FLASHCARD_DESKTOP_PORT, 10) : 0;

  try {
    const result = await bootstrapDesktopServer({
      userDataPath,
      port,
    });

    // Signal readiness to Electron parent process
    console.log(`FLASHCARD_MASTER_SERVER_READY:${result.url}`);

    let isClosing = false;
    const cleanup = async () => {
      if (isClosing) return;
      isClosing = true;
      try {
        await result.close();
      } catch (err) {
        console.error("[ServerRunner] Error during cleanup:", err);
      }
      process.exit(0);
    };

    process.on("SIGINT", cleanup);
    process.on("SIGTERM", cleanup);
    process.on("message", (msg) => {
      if (msg === "shutdown") {
        cleanup();
      }
    });

    process.stdin.resume();
    process.stdin.on("end", cleanup);
    process.stdin.on("close", cleanup);
  } catch (err: any) {
    console.error("[ServerRunner] Failed to start server:", err);
    process.exit(1);
  }
}

run();
