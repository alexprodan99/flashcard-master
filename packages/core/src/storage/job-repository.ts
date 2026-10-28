import type Database from "better-sqlite3";
import crypto from "node:crypto";
import {
  type Job,
  type JobLog,
  type JobType,
  type JobStatus,
  type JobLogLevel,
  JobSchema,
  JobLogSchema,
} from "../domain/models.js";

export interface CreateJobInput {
  id?: string;
  type: JobType;
  title: string;
  status?: JobStatus;
  totalSteps?: number;
  currentStep?: number;
  progressPercent?: number;
  currentStepName?: string;
  metadata?: Record<string, any>;
}

export interface UpdateJobInput {
  status?: JobStatus;
  currentStep?: number;
  totalSteps?: number;
  progressPercent?: number;
  currentStepName?: string;
  resultSummary?: Record<string, any>;
  errorMessage?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface AppendJobLogInput {
  jobId: string;
  stepNumber: number;
  stepTitle: string;
  level: JobLogLevel;
  message: string;
  details?: Record<string, any>;
}

export interface ListJobsFilter {
  status?: JobStatus | JobStatus[];
  type?: JobType;
  limit?: number;
}

export class JobRepository {
  constructor(private readonly db: Database.Database) {}

  private mapRowToJob(row: any): Job {
    return JobSchema.parse({
      id: row.id,
      type: row.type,
      status: row.status,
      title: row.title,
      totalSteps: Number(row.total_steps),
      currentStep: Number(row.current_step),
      progressPercent: Number(row.progress_percent),
      currentStepName: row.current_step_name || undefined,
      metadata: typeof row.metadata === "string" ? JSON.parse(row.metadata) : row.metadata || {},
      resultSummary: row.result_summary ? (typeof row.result_summary === "string" ? JSON.parse(row.result_summary) : row.result_summary) : undefined,
      errorMessage: row.error_message || undefined,
      createdAt: row.created_at,
      startedAt: row.started_at || undefined,
      completedAt: row.completed_at || undefined,
    });
  }

  private mapRowToJobLog(row: any): JobLog {
    return JobLogSchema.parse({
      id: row.id !== undefined ? Number(row.id) : undefined,
      jobId: row.job_id,
      stepNumber: Number(row.step_number),
      stepTitle: row.step_title,
      level: row.level,
      message: row.message,
      details: row.details ? (typeof row.details === "string" ? JSON.parse(row.details) : row.details) : undefined,
      timestamp: row.timestamp,
    });
  }

  create(input: CreateJobInput): Job {
    const id = input.id || crypto.randomUUID();
    const type = input.type;
    const title = input.title;
    const status = input.status || "queued";
    const totalSteps = input.totalSteps !== undefined ? input.totalSteps : 1;
    const currentStep = input.currentStep !== undefined ? input.currentStep : 0;
    const progressPercent = input.progressPercent !== undefined ? input.progressPercent : 0.0;
    const currentStepName = input.currentStepName || null;
    const metadata = JSON.stringify(input.metadata || {});
    const now = new Date().toISOString();

    const stmt = this.db.prepare(`
      INSERT INTO jobs (
        id, type, status, title, total_steps, current_step,
        progress_percent, current_step_name, metadata, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      type,
      status,
      title,
      totalSteps,
      currentStep,
      progressPercent,
      currentStepName,
      metadata,
      now
    );

    const created = this.getById(id);
    if (!created) {
      throw new Error(`Failed to create job with id ${id}`);
    }
    return created;
  }

  getById(id: string): Job | null {
    const stmt = this.db.prepare("SELECT * FROM jobs WHERE id = ?");
    const row = stmt.get(id);
    if (!row) return null;
    return this.mapRowToJob(row);
  }

  list(filter?: ListJobsFilter): Job[] {
    let sql = "SELECT * FROM jobs";
    const conditions: string[] = [];
    const params: any[] = [];

    if (filter?.status) {
      if (Array.isArray(filter.status)) {
        if (filter.status.length > 0) {
          const placeholders = filter.status.map(() => "?").join(", ");
          conditions.push(`status IN (${placeholders})`);
          params.push(...filter.status);
        } else {
          conditions.push("1 = 0");
        }
      } else {
        conditions.push("status = ?");
        params.push(filter.status);
      }
    }

    if (filter?.type) {
      conditions.push("type = ?");
      params.push(filter.type);
    }

    if (conditions.length > 0) {
      sql += " WHERE " + conditions.join(" AND ");
    }

    sql += " ORDER BY created_at DESC";

    if (filter?.limit && filter.limit > 0) {
      sql += " LIMIT ?";
      params.push(filter.limit);
    }

    const rows = this.db.prepare(sql).all(...params);
    return rows.map((r) => this.mapRowToJob(r));
  }

  update(id: string, updates: UpdateJobInput): Job {
    const existing = this.getById(id);
    if (!existing) {
      throw new Error(`Job not found: ${id}`);
    }

    const fields: string[] = [];
    const params: any[] = [];

    if (updates.status !== undefined) {
      fields.push("status = ?");
      params.push(updates.status);
    }
    if (updates.currentStep !== undefined) {
      fields.push("current_step = ?");
      params.push(updates.currentStep);
    }
    if (updates.totalSteps !== undefined) {
      fields.push("total_steps = ?");
      params.push(updates.totalSteps);
    }
    if (updates.progressPercent !== undefined) {
      fields.push("progress_percent = ?");
      params.push(updates.progressPercent);
    }
    if (updates.currentStepName !== undefined) {
      fields.push("current_step_name = ?");
      params.push(updates.currentStepName);
    }
    if (updates.resultSummary !== undefined) {
      fields.push("result_summary = ?");
      params.push(JSON.stringify(updates.resultSummary));
    }
    if (updates.errorMessage !== undefined) {
      fields.push("error_message = ?");
      params.push(updates.errorMessage);
    }
    if (updates.startedAt !== undefined) {
      fields.push("started_at = ?");
      params.push(updates.startedAt);
    }
    if (updates.completedAt !== undefined) {
      fields.push("completed_at = ?");
      params.push(updates.completedAt);
    }

    if (fields.length === 0) {
      return existing;
    }

    params.push(id);
    this.db.prepare(`UPDATE jobs SET ${fields.join(", ")} WHERE id = ?`).run(...params);

    const updated = this.getById(id);
    if (!updated) {
      throw new Error(`Failed to retrieve updated job: ${id}`);
    }
    return updated;
  }

  appendLog(input: AppendJobLogInput): JobLog {
    const now = new Date().toISOString();
    const detailsJson = input.details ? JSON.stringify(input.details) : null;

    const stmt = this.db.prepare(`
      INSERT INTO job_logs (job_id, step_number, step_title, level, message, details, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const res = stmt.run(
      input.jobId,
      input.stepNumber,
      input.stepTitle,
      input.level,
      input.message,
      detailsJson,
      now
    );

    return JobLogSchema.parse({
      id: Number(res.lastInsertRowid),
      jobId: input.jobId,
      stepNumber: input.stepNumber,
      stepTitle: input.stepTitle,
      level: input.level,
      message: input.message,
      details: input.details,
      timestamp: now,
    });
  }

  getLogs(jobId: string): JobLog[] {
    const stmt = this.db.prepare(
      "SELECT * FROM job_logs WHERE job_id = ? ORDER BY id ASC"
    );
    const rows = stmt.all(jobId);
    return rows.map((r) => this.mapRowToJobLog(r));
  }

  delete(id: string): boolean {
    const stmt = this.db.prepare("DELETE FROM jobs WHERE id = ?");
    const result = stmt.run(id);
    return result.changes > 0;
  }

  pruneCompletedJobs(options: { olderThanDays?: number; keepLastN?: number } = {}): number {
    const olderThanDays = options.olderThanDays !== undefined ? options.olderThanDays : 7;
    const keepLastN = options.keepLastN !== undefined ? options.keepLastN : 100;

    const completedStatuses = ["completed", "completed_with_warnings", "failed", "cancelled"];
    const placeholders = completedStatuses.map(() => "?").join(", ");

    // 1. Delete completed jobs older than X days
    const cutoffDate = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000).toISOString();
    let totalDeleted = 0;

    const timePruneStmt = this.db.prepare(`
      DELETE FROM jobs
      WHERE status IN (${placeholders})
        AND created_at < ?
    `);
    const timeRes = timePruneStmt.run(...completedStatuses, cutoffDate);
    totalDeleted += timeRes.changes;

    // 2. If there are still more completed jobs than keepLastN, delete excess oldest
    const excessQuery = `
      DELETE FROM jobs
      WHERE id IN (
        SELECT id FROM jobs
        WHERE status IN (${placeholders})
        ORDER BY created_at DESC
        LIMIT -1 OFFSET ?
      )
    `;
    const excessRes = this.db.prepare(excessQuery).run(...completedStatuses, keepLastN);
    totalDeleted += excessRes.changes;

    return totalDeleted;
  }

  clearHistory(): number {
    const finishedStatuses = ["completed", "completed_with_warnings", "failed", "cancelled"];
    const placeholders = finishedStatuses.map(() => "?").join(", ");
    const stmt = this.db.prepare(`
      DELETE FROM jobs WHERE status IN (${placeholders})
    `);
    const res = stmt.run(...finishedStatuses);
    return res.changes;
  }

  recoverInterruptedJobs(): number {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      UPDATE jobs
      SET status = 'failed',
          error_message = 'Job was interrupted by unexpected server restart or shutdown.',
          completed_at = ?
      WHERE status IN ('running', 'queued')
    `);
    const res = stmt.run(now);
    return res.changes;
  }
}
