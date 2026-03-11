import { BaseAgent } from "./base.js";
import type { Platform, Genre } from "../models/book.js";

export interface RadarResult {
  readonly recommendations: ReadonlyArray<RadarRecommendation>;
  readonly marketSummary: string;
  readonly timestamp: string;
}

export interface RadarRecommendation {
  readonly platform: Platform;
  readonly genre: Genre;
  readonly concept: string;
  readonly confidence: number;
  readonly reasoning: string;
  readonly benchmarkTitles: ReadonlyArray<string>;
}

export class RadarAgent extends BaseAgent {
  get name(): string {
    return "radar";
  }

  async scan(platforms: ReadonlyArray<Platform>): Promise<RadarResult> {
    const systemPrompt = `你是一个专业的网络小说市场分析师。你的任务是分析当前网文市场热度，推荐有潜力的题材和概念。

你需要基于以下平台的当前趋势进行分析：${platforms.join("、")}

分析维度：
1. 当前热门题材和标签
2. 高追读/收藏的作品类型
3. 市场空白和机会点
4. 风险提示（过度饱和的题材）

输出格式必须为 JSON：
{
  "recommendations": [
    {
      "platform": "平台名",
      "genre": "题材类型",
      "concept": "一句话概念描述",
      "confidence": 0.0-1.0,
      "reasoning": "推荐理由",
      "benchmarkTitles": ["对标书1", "对标书2"]
    }
  ],
  "marketSummary": "整体市场概述"
}

推荐数量：3-5个，按 confidence 降序排列。`;

    const response = await this.chat(
      [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `请分析当前${platforms.join("、")}平台的网文市场热度，给出开书建议。`,
        },
      ],
      { temperature: 0.6, maxTokens: 4096 },
    );

    return this.parseResult(response.content);
  }

  private parseResult(content: string): RadarResult {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("Radar output format error: no JSON found");
    }

    try {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        recommendations: parsed.recommendations ?? [],
        marketSummary: parsed.marketSummary ?? "",
        timestamp: new Date().toISOString(),
      };
    } catch (e) {
      throw new Error(`Radar JSON parse error: ${e}`);
    }
  }
}
