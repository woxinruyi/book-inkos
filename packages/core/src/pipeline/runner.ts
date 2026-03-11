import type OpenAI from "openai";
import type { BookConfig } from "../models/book.js";
import type { ChapterMeta } from "../models/chapter.js";
import type { NotifyChannel } from "../models/project.js";
import { ArchitectAgent } from "../agents/architect.js";
import { WriterAgent } from "../agents/writer.js";
import { ContinuityAuditor } from "../agents/continuity.js";
import { ReviserAgent } from "../agents/reviser.js";
import { RadarAgent } from "../agents/radar.js";
import { StateManager } from "../state/manager.js";
import { dispatchNotification } from "../notify/dispatcher.js";
import type { AgentContext } from "../agents/base.js";
import type { AuditResult } from "../agents/continuity.js";
import type { RadarResult } from "../agents/radar.js";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export interface PipelineConfig {
  readonly client: OpenAI;
  readonly model: string;
  readonly projectRoot: string;
  readonly notifyChannels?: ReadonlyArray<NotifyChannel>;
}

export interface ChapterPipelineResult {
  readonly chapterNumber: number;
  readonly title: string;
  readonly wordCount: number;
  readonly auditResult: AuditResult;
  readonly revised: boolean;
  readonly status: "approved" | "needs-review";
}

export class PipelineRunner {
  private readonly state: StateManager;
  private readonly config: PipelineConfig;

  constructor(config: PipelineConfig) {
    this.config = config;
    this.state = new StateManager(config.projectRoot);
  }

  private agentCtx(bookId?: string): AgentContext {
    return {
      client: this.config.client,
      model: this.config.model,
      projectRoot: this.config.projectRoot,
      bookId,
    };
  }

  async runRadar(): Promise<RadarResult> {
    const radar = new RadarAgent(this.agentCtx());
    return radar.scan(["tomato", "feilu"]);
  }

  async initBook(book: BookConfig): Promise<void> {
    const architect = new ArchitectAgent(this.agentCtx(book.id));
    const bookDir = this.state.bookDir(book.id);

    await this.state.saveBookConfig(book.id, book);

    const foundation = await architect.generateFoundation(book);
    await architect.writeFoundationFiles(bookDir, foundation);
    await this.state.saveChapterIndex(book.id, []);
  }

  async writeNextChapter(bookId: string): Promise<ChapterPipelineResult> {
    const book = await this.state.loadBookConfig(bookId);
    const bookDir = this.state.bookDir(bookId);
    const chapterNumber = await this.state.getNextChapterNumber(bookId);

    // 1. Write chapter
    const writer = new WriterAgent(this.agentCtx(bookId));
    const output = await writer.writeChapter({
      book,
      bookDir,
      chapterNumber,
    });

    // 2. Audit chapter
    const auditor = new ContinuityAuditor(this.agentCtx(bookId));
    let auditResult = await auditor.auditChapter(
      bookDir,
      output.content,
      chapterNumber,
    );

    let finalContent = output.content;
    let finalWordCount = output.wordCount;
    let revised = false;

    // 3. If audit fails, try auto-revise once
    if (!auditResult.passed) {
      const criticalIssues = auditResult.issues.filter(
        (i) => i.severity === "critical",
      );
      if (criticalIssues.length > 0) {
        const reviser = new ReviserAgent(this.agentCtx(bookId));
        const reviseOutput = await reviser.reviseChapter(
          bookDir,
          output.content,
          chapterNumber,
          auditResult.issues,
        );

        if (reviseOutput.revisedContent.length > 0) {
          finalContent = reviseOutput.revisedContent;
          finalWordCount = reviseOutput.wordCount;
          revised = true;

          // Re-audit the revised content
          auditResult = await auditor.auditChapter(
            bookDir,
            finalContent,
            chapterNumber,
          );

          // Update state files from revision
          const storyDir = join(bookDir, "story");
          if (reviseOutput.updatedState !== "(状态卡未更新)") {
            await writeFile(join(storyDir, "current_state.md"), reviseOutput.updatedState, "utf-8");
          }
          if (reviseOutput.updatedLedger !== "(账本未更新)") {
            await writeFile(join(storyDir, "particle_ledger.md"), reviseOutput.updatedLedger, "utf-8");
          }
          if (reviseOutput.updatedHooks !== "(伏笔池未更新)") {
            await writeFile(join(storyDir, "pending_hooks.md"), reviseOutput.updatedHooks, "utf-8");
          }
        }
      }
    }

    // 4. Save chapter (original or revised)
    const chaptersDir = join(bookDir, "chapters");
    const paddedNum = String(chapterNumber).padStart(4, "0");
    const title = revised ? output.title : output.title;
    const filename = `${paddedNum}_${title.replace(/[/\\?%*:|"<>]/g, "").replace(/\s+/g, "_").slice(0, 50)}.md`;

    await writeFile(
      join(chaptersDir, filename),
      `# 第${chapterNumber}章 ${title}\n\n${finalContent}`,
      "utf-8",
    );

    // Save original state files if not revised
    if (!revised) {
      await writer.saveChapter(bookDir, output);
    }

    // 5. Update chapter index
    const existingIndex = await this.state.loadChapterIndex(bookId);
    const now = new Date().toISOString();
    const newEntry: ChapterMeta = {
      number: chapterNumber,
      title: output.title,
      status: auditResult.passed ? "ready-for-review" : "audit-failed",
      wordCount: finalWordCount,
      createdAt: now,
      updatedAt: now,
      auditIssues: auditResult.issues.map(
        (i) => `[${i.severity}] ${i.description}`,
      ),
    };
    await this.state.saveChapterIndex(bookId, [...existingIndex, newEntry]);

    // 6. Send notification
    if (this.config.notifyChannels && this.config.notifyChannels.length > 0) {
      const statusEmoji = auditResult.passed ? "✅" : "⚠️";
      await dispatchNotification(this.config.notifyChannels, {
        title: `${statusEmoji} ${book.title} 第${chapterNumber}章`,
        body: [
          `**${output.title}** | ${finalWordCount}字`,
          revised ? "📝 已自动修正" : "",
          `审稿: ${auditResult.passed ? "通过" : "需人工审核"}`,
          ...auditResult.issues
            .filter((i) => i.severity !== "info")
            .map((i) => `- [${i.severity}] ${i.description}`),
        ]
          .filter(Boolean)
          .join("\n"),
      });
    }

    return {
      chapterNumber,
      title: output.title,
      wordCount: finalWordCount,
      auditResult,
      revised,
      status: auditResult.passed ? "approved" : "needs-review",
    };
  }
}
