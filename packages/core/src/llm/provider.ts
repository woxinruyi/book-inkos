import OpenAI from "openai";
import type { LLMConfig } from "../models/project.js";

export interface LLMResponse {
  readonly content: string;
  readonly usage: {
    readonly promptTokens: number;
    readonly completionTokens: number;
    readonly totalTokens: number;
  };
}

export interface LLMMessage {
  readonly role: "system" | "user" | "assistant";
  readonly content: string;
}

export function createLLMClient(config: LLMConfig): OpenAI {
  return new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseUrl,
  });
}

export async function chatCompletion(
  client: OpenAI,
  model: string,
  messages: ReadonlyArray<LLMMessage>,
  options?: {
    readonly temperature?: number;
    readonly maxTokens?: number;
  },
): Promise<LLMResponse> {
  // Use streaming mode — some providers (codex-for.me) require it
  const stream = await client.chat.completions.create({
    model,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
    temperature: options?.temperature ?? 0.7,
    max_tokens: options?.maxTokens ?? 8192,
    stream: true,
  });

  const chunks: string[] = [];
  let promptTokens = 0;
  let completionTokens = 0;
  let totalTokens = 0;

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) {
      chunks.push(delta);
    }
    if (chunk.usage) {
      promptTokens = chunk.usage.prompt_tokens ?? 0;
      completionTokens = chunk.usage.completion_tokens ?? 0;
      totalTokens = chunk.usage.total_tokens ?? 0;
    }
  }

  const content = chunks.join("");
  if (!content) {
    throw new Error("LLM returned empty response");
  }

  return {
    content,
    usage: { promptTokens, completionTokens, totalTokens },
  };
}
