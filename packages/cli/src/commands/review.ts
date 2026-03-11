import { Command } from "commander";
import { StateManager } from "@inkos/core";
import { findProjectRoot, log, logError } from "../utils.js";

export const reviewCommand = new Command("review")
  .description("Review and approve chapters");

reviewCommand
  .command("list")
  .description("List chapters pending review")
  .argument("[book-id]", "Book ID (optional, lists all books if omitted)")
  .action(async (bookId?: string) => {
    try {
      const root = findProjectRoot();
      const state = new StateManager(root);

      const bookIds = bookId ? [bookId] : await state.listBooks();

      for (const id of bookIds) {
        const index = await state.loadChapterIndex(id);
        const pending = index.filter(
          (ch) =>
            ch.status === "ready-for-review" || ch.status === "audit-failed",
        );

        if (pending.length === 0) continue;

        const book = await state.loadBookConfig(id);
        log(`\n${book.title} (${id}):`);
        for (const ch of pending) {
          log(
            `  Ch.${ch.number} "${ch.title}" | ${ch.wordCount}字 | ${ch.status}`,
          );
          if (ch.auditIssues.length > 0) {
            for (const issue of ch.auditIssues) {
              log(`    - ${issue}`);
            }
          }
        }
      }
    } catch (e) {
      logError(`Failed to list reviews: ${e}`);
      process.exit(1);
    }
  });

reviewCommand
  .command("approve")
  .description("Approve a chapter")
  .argument("<book-id>", "Book ID")
  .argument("<chapter>", "Chapter number")
  .action(async (bookId: string, chapterStr: string) => {
    try {
      const root = findProjectRoot();
      const state = new StateManager(root);
      const chapterNum = parseInt(chapterStr, 10);

      const index = [...(await state.loadChapterIndex(bookId))];
      const idx = index.findIndex((ch) => ch.number === chapterNum);
      if (idx === -1) {
        logError(`Chapter ${chapterNum} not found`);
        process.exit(1);
      }

      index[idx] = {
        ...index[idx]!,
        status: "approved",
        updatedAt: new Date().toISOString(),
      };
      await state.saveChapterIndex(bookId, index);
      log(`Chapter ${chapterNum} approved.`);
    } catch (e) {
      logError(`Failed to approve: ${e}`);
      process.exit(1);
    }
  });

reviewCommand
  .command("reject")
  .description("Reject a chapter")
  .argument("<book-id>", "Book ID")
  .argument("<chapter>", "Chapter number")
  .option("--reason <reason>", "Rejection reason")
  .action(async (bookId: string, chapterStr: string, opts) => {
    try {
      const root = findProjectRoot();
      const state = new StateManager(root);
      const chapterNum = parseInt(chapterStr, 10);

      const index = [...(await state.loadChapterIndex(bookId))];
      const idx = index.findIndex((ch) => ch.number === chapterNum);
      if (idx === -1) {
        logError(`Chapter ${chapterNum} not found`);
        process.exit(1);
      }

      index[idx] = {
        ...index[idx]!,
        status: "rejected",
        reviewNote: opts.reason ?? "Rejected without reason",
        updatedAt: new Date().toISOString(),
      };
      await state.saveChapterIndex(bookId, index);
      log(`Chapter ${chapterNum} rejected.`);
    } catch (e) {
      logError(`Failed to reject: ${e}`);
      process.exit(1);
    }
  });
