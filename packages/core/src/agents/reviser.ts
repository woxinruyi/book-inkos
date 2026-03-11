import { BaseAgent } from "./base.js";
import type { BookConfig } from "../models/book.js";
import type { AuditIssue } from "./continuity.js";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export interface ReviseOutput {
  readonly revisedContent: string;
  readonly wordCount: number;
  readonly fixedIssues: ReadonlyArray<string>;
  readonly updatedState: string;
  readonly updatedLedger: string;
  readonly updatedHooks: string;
}

export class ReviserAgent extends BaseAgent {
  get name(): string {
    return "reviser";
  }

  async reviseChapter(
    bookDir: string,
    chapterContent: string,
    chapterNumber: number,
    issues: ReadonlyArray<AuditIssue>,
  ): Promise<ReviseOutput> {
    const [currentState, ledger, hooks, styleGuide] = await Promise.all([
      this.readFileSafe(join(bookDir, "story/current_state.md")),
      this.readFileSafe(join(bookDir, "story/particle_ledger.md")),
      this.readFileSafe(join(bookDir, "story/pending_hooks.md")),
      this.readFileSafe(join(bookDir, "story/style_guide.md")),
    ]);

    const issueList = issues
      .map((i) => `- [${i.severity}] ${i.category}: ${i.description}\n  建议: ${i.suggestion}`)
      .join("\n");

    const systemPrompt = `你是一位专业的网络小说修稿编辑。你的任务是根据审稿意见对章节进行最小幅度修正。

修稿原则：
1. 只修问题，不改风格
2. 修根因，不做表面润色
3. 数值错误必须精确修正，前后对账
4. 伏笔状态必须与伏笔池同步
5. 不改变剧情走向和核心冲突
6. 保持原文的语言风格和节奏
7. 修改后同步更新状态卡、账本、伏笔池

输出格式：

=== FIXED_ISSUES ===
(逐条说明修正了什么，一行一条)

=== REVISED_CONTENT ===
(修正后的完整正文)

=== UPDATED_STATE ===
(更新后的完整状态卡)

=== UPDATED_LEDGER ===
(更新后的完整资源账本)

=== UPDATED_HOOKS ===
(更新后的完整伏笔池)`;

    const userPrompt = `请修正第${chapterNumber}章。

## 审稿问题
${issueList}

## 当前状态卡
${currentState}

## 资源账本
${ledger}

## 伏笔池
${hooks}

## 文风指南
${styleGuide}

## 待修正章节
${chapterContent}`;

    const response = await this.chat(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      { temperature: 0.3, maxTokens: 16384 },
    );

    return this.parseOutput(response.content);
  }

  private parseOutput(content: string): ReviseOutput {
    const extract = (tag: string): string => {
      const regex = new RegExp(
        `=== ${tag} ===\\s*([\\s\\S]*?)(?==== [A-Z_]+ ===|$)`,
      );
      const match = content.match(regex);
      return match?.[1]?.trim() ?? "";
    };

    const revisedContent = extract("REVISED_CONTENT");
    const fixedRaw = extract("FIXED_ISSUES");

    return {
      revisedContent,
      wordCount: revisedContent.length,
      fixedIssues: fixedRaw
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 0),
      updatedState: extract("UPDATED_STATE") || "(状态卡未更新)",
      updatedLedger: extract("UPDATED_LEDGER") || "(账本未更新)",
      updatedHooks: extract("UPDATED_HOOKS") || "(伏笔池未更新)",
    };
  }

  private async readFileSafe(path: string): Promise<string> {
    try {
      return await readFile(path, "utf-8");
    } catch {
      return "(文件不存在)";
    }
  }
}
