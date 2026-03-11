import { BaseAgent } from "./base.js";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export interface AuditResult {
  readonly passed: boolean;
  readonly issues: ReadonlyArray<AuditIssue>;
  readonly summary: string;
}

export interface AuditIssue {
  readonly severity: "critical" | "warning" | "info";
  readonly category: string;
  readonly description: string;
  readonly suggestion: string;
}

export class ContinuityAuditor extends BaseAgent {
  get name(): string {
    return "continuity-auditor";
  }

  async auditChapter(
    bookDir: string,
    chapterContent: string,
    chapterNumber: number,
  ): Promise<AuditResult> {
    const [currentState, ledger, hooks, styleGuide] = await Promise.all([
      this.readFileSafe(join(bookDir, "story/current_state.md")),
      this.readFileSafe(join(bookDir, "story/particle_ledger.md")),
      this.readFileSafe(join(bookDir, "story/pending_hooks.md")),
      this.readFileSafe(join(bookDir, "story/style_guide.md")),
    ]);

    const systemPrompt = `你是一位严格的网络小说审稿编辑。你的任务是对章节进行连续性、一致性和质量审查。

审查维度：
1. OOC检查：角色行为是否符合已确立人设
2. 时间线检查：时间/地点是否连贯
3. 设定冲突：是否违反已确立的世界观规则
4. 战力崩坏：是否出现不合理的实力变化
5. 数值检查：资源/数值变动是否与账本一致
6. 伏笔检查：是否有遗漏或矛盾的伏笔
7. 节奏检查：是否拖沓或跳跃
8. 文风检查：是否偏离风格指南
9. 信息越界：角色是否知道了不该知道的信息
10. 词汇疲劳：是否有过度重复的表达

输出格式必须为 JSON：
{
  "passed": true/false,
  "issues": [
    {
      "severity": "critical|warning|info",
      "category": "审查维度名称",
      "description": "具体问题描述",
      "suggestion": "修改建议"
    }
  ],
  "summary": "一句话总结审查结论"
}

只有当存在 critical 级别问题时，passed 才为 false。`;

    const userPrompt = `请审查第${chapterNumber}章。

## 当前状态卡
${currentState}

## 资源账本
${ledger}

## 伏笔池
${hooks}

## 文风指南
${styleGuide}

## 待审章节内容
${chapterContent}`;

    const response = await this.chat(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      { temperature: 0.3, maxTokens: 4096 },
    );

    return this.parseAuditResult(response.content);
  }

  private parseAuditResult(content: string): AuditResult {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return {
        passed: false,
        issues: [
          {
            severity: "critical",
            category: "系统错误",
            description: "审稿输出格式异常，无法解析",
            suggestion: "重新运行审稿",
          },
        ],
        summary: "审稿输出解析失败",
      };
    }

    try {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        passed: Boolean(parsed.passed),
        issues: Array.isArray(parsed.issues) ? parsed.issues : [],
        summary: String(parsed.summary ?? ""),
      };
    } catch {
      return {
        passed: false,
        issues: [
          {
            severity: "critical",
            category: "系统错误",
            description: "审稿 JSON 解析失败",
            suggestion: "重新运行审稿",
          },
        ],
        summary: "审稿 JSON 解析失败",
      };
    }
  }

  private async readFileSafe(path: string): Promise<string> {
    try {
      return await readFile(path, "utf-8");
    } catch {
      return "(文件不存在)";
    }
  }
}
