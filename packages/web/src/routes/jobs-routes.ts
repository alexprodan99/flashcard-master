import fs from "node:fs";
import { getWebPackageVersion, type RouteContext } from "./route-context.js";

/**
 * Handles `/api/health`, `/api/media/*`, `/api/jobs/*`, and `/api/stats` routes.
 * Returns `true` when the request has been handled.
 */
export async function handleJobsAndMediaRoutes(ctx: RouteContext): Promise<boolean> {
  const { req, res, pathname, method, query, jobManager, settingsService, mediaService, options } = ctx;

  // 2. Health Endpoint
  if (pathname === "/api/health" && method === "GET") {
    ctx.sendJson(200, { status: "ok", version: getWebPackageVersion() });
    return true;
  }

  // 2b. Local Media Static Streaming Endpoint: GET /api/media/:filename
  if (pathname.startsWith("/api/media/") && method === "GET") {
    const rawFilename = pathname.slice("/api/media/".length);
    let filename = "";
    try {
      filename = decodeURIComponent(rawFilename);
    } catch {
      filename = rawFilename;
    }

    if (
      !filename ||
      filename.includes("..") ||
      filename.includes("/") ||
      filename.includes("\\") ||
      filename.includes("\0")
    ) {
      ctx.sendJson(400, { error: "Invalid media filename or path traversal detected" });
      return true;
    }

    const sanitized = mediaService.sanitizeFilename(filename);
    let mediaPath = "";
    try {
      mediaPath = mediaService.getMediaPath(sanitized);
    } catch {
      ctx.sendJson(400, { error: "Invalid media path" });
      return true;
    }

    if (!fs.existsSync(mediaPath) || !fs.statSync(mediaPath).isFile()) {
      ctx.sendJson(404, { error: "Media file not found" });
      return true;
    }

    const stat = fs.statSync(mediaPath);
    const contentType = mediaService.detectMimeType(sanitized);

    res.writeHead(200, {
      "Content-Type": contentType,
      "Content-Length": stat.size,
      "Cache-Control": "public, max-age=31536000, immutable",
      ...ctx.buildCorsHeaders(),
    });

    const stream = fs.createReadStream(mediaPath);
    stream.on("error", () => {
      if (!res.headersSent) {
        ctx.sendJson(500, { error: "Failed to stream media file" });
      }
    });
    stream.pipe(res);
    return true;
  }

  // 2c. Global Job Events SSE Stream: GET /api/jobs/stream
  if (pathname === "/api/jobs/stream" && method === "GET") {
    if (!jobManager) {
      ctx.sendJson(503, { error: "JobManager not configured on this server" });
      return true;
    }

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      ...ctx.buildCorsHeaders(),
    });

    res.write(`event: connected\ndata: ${JSON.stringify({ status: "connected", timestamp: new Date().toISOString() })}\n\n`);

    const onCreated = (job: any) => res.write(`event: job_created\ndata: ${JSON.stringify(job)}\n\n`);
    const onStatus = (job: any) => res.write(`event: job_status\ndata: ${JSON.stringify(job)}\n\n`);
    const onProgress = (data: any) => res.write(`event: job_progress\ndata: ${JSON.stringify(data)}\n\n`);
    const onLog = (log: any) => res.write(`event: job_log\ndata: ${JSON.stringify(log)}\n\n`);
    const onCompleted = (job: any) => res.write(`event: job_completed\ndata: ${JSON.stringify(job)}\n\n`);
    const onFailed = (job: any) => res.write(`event: job_failed\ndata: ${JSON.stringify(job)}\n\n`);
    const onCancelled = (job: any) => res.write(`event: job_cancelled\ndata: ${JSON.stringify(job)}\n\n`);
    const onCard = (cardData: any) => res.write(`event: card_created\ndata: ${JSON.stringify(cardData)}\n\n`);
    const onLimitsUpdated = (limits: any) => res.write(`event: limits_updated\ndata: ${JSON.stringify(limits)}\n\n`);

    jobManager.on("job_created", onCreated);
    jobManager.on("job_status", onStatus);
    jobManager.on("job_progress", onProgress);
    jobManager.on("job_log", onLog);
    jobManager.on("job_completed", onCompleted);
    jobManager.on("job_failed", onFailed);
    jobManager.on("job_cancelled", onCancelled);
    jobManager.on("card_created", onCard);
    jobManager.on("limits_updated", onLimitsUpdated);

    const heartbeat = setInterval(() => {
      res.write(": ping\n\n");
    }, 15000);

    req.on("close", () => {
      clearInterval(heartbeat);
      jobManager.off("job_created", onCreated);
      jobManager.off("job_status", onStatus);
      jobManager.off("job_progress", onProgress);
      jobManager.off("job_log", onLog);
      jobManager.off("job_completed", onCompleted);
      jobManager.off("job_failed", onFailed);
      jobManager.off("job_cancelled", onCancelled);
      jobManager.off("card_created", onCard);
      jobManager.off("limits_updated", onLimitsUpdated);
    });
    return true;
  }

  // 2d. Step-by-Step Job Logs SSE Stream: GET /api/jobs/:id/logs/stream
  const jobLogsStreamMatch = pathname.match(/^\/api\/jobs\/([^/]+)\/logs\/stream$/);
  if (jobLogsStreamMatch && method === "GET") {
    const jobId = ctx.decodeRouteParam(jobLogsStreamMatch[1]);
    if (!jobManager) {
      ctx.sendJson(503, { error: "JobManager not configured on this server" });
      return true;
    }

    const job = jobManager.getJob(jobId);
    if (!job) {
      ctx.sendJson(404, { error: `Job with ID "${jobId}" not found` });
      return true;
    }

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      ...ctx.buildCorsHeaders(),
    });

    res.write(`event: connected\ndata: ${JSON.stringify({ jobId, status: job.status })}\n\n`);

    const existingLogs = jobManager.getJobLogs(jobId);
    for (const log of existingLogs) {
      res.write(`event: job_log\ndata: ${JSON.stringify(log)}\n\n`);
    }

    const onLog = (log: any) => {
      if (log.jobId === jobId) res.write(`event: job_log\ndata: ${JSON.stringify(log)}\n\n`);
    };
    const onStatus = (j: any) => {
      if (j.id === jobId) res.write(`event: job_status\ndata: ${JSON.stringify(j)}\n\n`);
    };
    const onCard = (cardData: any) => {
      if (cardData.jobId === jobId) res.write(`event: card_created\ndata: ${JSON.stringify(cardData)}\n\n`);
    };

    jobManager.on("job_log", onLog);
    jobManager.on("job_status", onStatus);
    jobManager.on("card_created", onCard);

    const heartbeat = setInterval(() => {
      res.write(": ping\n\n");
    }, 15000);

    req.on("close", () => {
      clearInterval(heartbeat);
      jobManager.off("job_log", onLog);
      jobManager.off("job_status", onStatus);
      jobManager.off("card_created", onCard);
    });
    return true;
  }

  // 2e. Cancel Job: POST /api/jobs/:id/cancel
  const jobCancelMatch = pathname.match(/^\/api\/jobs\/([^/]+)\/cancel$/);
  if (jobCancelMatch && method === "POST") {
    const jobId = ctx.decodeRouteParam(jobCancelMatch[1]);
    if (!jobManager) {
      ctx.sendJson(503, { error: "JobManager not configured" });
      return true;
    }
    const existing = jobManager.getJob(jobId);
    if (!existing) {
      ctx.sendJson(404, { error: `Job with ID "${jobId}" not found` });
      return true;
    }
    const cancelled = jobManager.cancelJob(jobId);
    const updated = jobManager.getJob(jobId);
    ctx.sendJson(200, { success: true, cancelled, job: updated });
    return true;
  }

  // 2f. Clear / Prune History: DELETE /api/jobs/history or POST /api/jobs/history
  if (pathname === "/api/jobs/history" && (method === "DELETE" || method === "POST")) {
    if (!jobManager) {
      ctx.sendJson(503, { error: "JobManager not configured" });
      return true;
    }
    const keepLastNStr = query.keepLastN as string | undefined;
    const keepLastN = keepLastNStr ? parseInt(keepLastNStr, 10) : undefined;
    const deletedCount =
      typeof keepLastN === "number" && !isNaN(keepLastN)
        ? jobManager.pruneJobs({ keepLastN })
        : jobManager.clearHistory();
    ctx.sendJson(200, { success: true, deletedCount });
    return true;
  }

  // 2fa. Get Worker Pool Concurrency Limits & Live Status: GET /api/jobs/limits
  if (pathname === "/api/jobs/limits" && method === "GET") {
    const limits = jobManager ? jobManager.getLimits() : settingsService.getWorkerConcurrencyLimits();
    const activeCounts = jobManager ? jobManager.getActiveCounts() : { generation: 0, sync: 0, export: 0 };
    const queueLengths = jobManager ? jobManager.getQueueLengths() : { generation: 0, sync: 0, export: 0 };
    ctx.sendJson(200, { limits, activeCounts, queueLengths });
    return true;
  }

  // 2g. List Jobs: GET /api/jobs
  if (pathname === "/api/jobs" && method === "GET") {
    if (!jobManager) {
      ctx.sendJson(200, []);
      return true;
    }
    const status = query.status as any;
    const type = query.type as any;
    const limitStr = query.limit as string;
    const limit = limitStr ? parseInt(limitStr, 10) : undefined;
    const jobs = jobManager.listJobs({ status, type, limit });
    ctx.sendJson(200, jobs);
    return true;
  }

  // 2h. Get Single Job Details with Logs: GET /api/jobs/:id
  const singleJobMatch = pathname.match(/^\/api\/jobs\/([^/]+)$/);
  if (
    singleJobMatch &&
    method === "GET" &&
    !pathname.endsWith("/stream") &&
    !pathname.endsWith("/history")
  ) {
    const jobId = ctx.decodeRouteParam(singleJobMatch[1]);
    if (!jobManager) {
      ctx.sendJson(404, { error: "JobManager not configured" });
      return true;
    }
    const job = jobManager.getJob(jobId);
    if (!job) {
      ctx.sendJson(404, { error: `Job with ID "${jobId}" not found` });
      return true;
    }
    const logs = jobManager.getJobLogs(jobId);
    ctx.sendJson(200, { job, logs });
    return true;
  }

  // 3. Stats Endpoint
  if (pathname === "/api/stats" && method === "GET") {
    const sources = options.sourceRepo.list();
    const cards = options.cardRepo.list();
    const decks = options.cardRepo.listDecks();

    ctx.sendJson(200, {
      totalCards: cards.length,
      totalSources: sources.length,
      activeSources: sources.filter((s) => s.isActive).length,
      totalDecks: decks.length,
      decks,
      recentCards: cards.slice(0, 10),
    });
    return true;
  }

  return false;
}
