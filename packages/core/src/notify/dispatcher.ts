import type { NotifyChannel } from "../models/project.js";
import { sendTelegram } from "./telegram.js";
import { sendFeishu } from "./feishu.js";
import { sendWechatWork } from "./wechat-work.js";

export interface NotifyMessage {
  readonly title: string;
  readonly body: string;
}

export async function dispatchNotification(
  channels: ReadonlyArray<NotifyChannel>,
  message: NotifyMessage,
): Promise<void> {
  const fullText = `**${message.title}**\n\n${message.body}`;

  const tasks = channels.map(async (channel) => {
    try {
      switch (channel.type) {
        case "telegram":
          await sendTelegram(
            { botToken: channel.botToken, chatId: channel.chatId },
            fullText,
          );
          break;
        case "feishu":
          await sendFeishu(
            { webhookUrl: channel.webhookUrl },
            message.title,
            message.body,
          );
          break;
        case "wechat-work":
          await sendWechatWork(
            { webhookUrl: channel.webhookUrl },
            fullText,
          );
          break;
      }
    } catch (e) {
      // Log but don't throw — notification failure shouldn't block pipeline
      process.stderr.write(
        `[notify] ${channel.type} failed: ${e}\n`,
      );
    }
  });

  await Promise.all(tasks);
}
