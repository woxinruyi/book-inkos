import { PipelineRunner } from "./runner.js";
import type { PipelineConfig } from "./runner.js";
import { StateManager } from "../state/manager.js";
import type { BookConfig } from "../models/book.js";

export interface SchedulerConfig extends PipelineConfig {
  readonly radarCron: string;
  readonly writeCron: string;
  readonly auditCron: string;
  readonly maxConcurrentBooks: number;
  readonly onChapterComplete?: (bookId: string, chapter: number, status: string) => void;
  readonly onError?: (bookId: string, error: Error) => void;
}

interface ScheduledTask {
  readonly name: string;
  readonly intervalMs: number;
  timer?: ReturnType<typeof setInterval>;
}

export class Scheduler {
  private readonly pipeline: PipelineRunner;
  private readonly state: StateManager;
  private readonly config: SchedulerConfig;
  private tasks: ScheduledTask[] = [];
  private running = false;

  constructor(config: SchedulerConfig) {
    this.config = config;
    this.pipeline = new PipelineRunner(config);
    this.state = new StateManager(config.projectRoot);
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    // Run write cycle immediately on start, then schedule
    await this.runWriteCycle();

    // Schedule recurring write cycle (default: every 2 hours)
    const writeCycleMs = this.cronToMs(this.config.writeCron);
    const writeTask: ScheduledTask = {
      name: "write-cycle",
      intervalMs: writeCycleMs,
    };
    writeTask.timer = setInterval(() => {
      this.runWriteCycle().catch((e) => {
        this.config.onError?.("scheduler", e as Error);
      });
    }, writeCycleMs);
    this.tasks.push(writeTask);

    // Schedule radar scan (default: daily)
    const radarMs = this.cronToMs(this.config.radarCron);
    const radarTask: ScheduledTask = {
      name: "radar-scan",
      intervalMs: radarMs,
    };
    radarTask.timer = setInterval(() => {
      this.runRadarScan().catch((e) => {
        this.config.onError?.("radar", e as Error);
      });
    }, radarMs);
    this.tasks.push(radarTask);
  }

  stop(): void {
    this.running = false;
    for (const task of this.tasks) {
      if (task.timer) clearInterval(task.timer);
    }
    this.tasks = [];
  }

  get isRunning(): boolean {
    return this.running;
  }

  private async runWriteCycle(): Promise<void> {
    const bookIds = await this.state.listBooks();

    const activeBooks: Array<{ id: string; config: BookConfig }> = [];
    for (const id of bookIds) {
      const config = await this.state.loadBookConfig(id);
      if (config.status === "active" || config.status === "outlining") {
        activeBooks.push({ id, config });
      }
    }

    const booksToWrite = activeBooks.slice(0, this.config.maxConcurrentBooks);

    for (const book of booksToWrite) {
      try {
        const result = await this.pipeline.writeNextChapter(book.id);
        this.config.onChapterComplete?.(
          book.id,
          result.chapterNumber,
          result.status,
        );
      } catch (e) {
        this.config.onError?.(book.id, e as Error);
      }
    }
  }

  private async runRadarScan(): Promise<void> {
    try {
      await this.pipeline.runRadar();
    } catch (e) {
      this.config.onError?.("radar", e as Error);
    }
  }

  private cronToMs(cron: string): number {
    // Simple cron-to-interval mapping for common patterns
    // "0 9 * * *" = daily = 24h
    // "0 14 * * *" = daily = 24h
    // "0 */2 * * *" = every 2h
    const parts = cron.split(" ");
    if (parts.length >= 5) {
      const hour = parts[1]!;
      if (hour.startsWith("*/")) {
        const interval = parseInt(hour.slice(2), 10);
        return interval * 60 * 60 * 1000;
      }
      // Default: treat as daily
      return 24 * 60 * 60 * 1000;
    }
    return 24 * 60 * 60 * 1000;
  }
}
