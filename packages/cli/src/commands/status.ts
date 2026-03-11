import { Command } from "commander";
import { StateManager } from "@inkos/core";
import { findProjectRoot, log, logError } from "../utils.js";

export const statusCommand = new Command("status")
  .description("Show project status")
  .action(async () => {
    try {
      const root = findProjectRoot();
      const state = new StateManager(root);

      const bookIds = await state.listBooks();

      log(`InkOS Project: ${root}`);
      log(`Books: ${bookIds.length}`);
      log("");

      for (const id of bookIds) {
        const book = await state.loadBookConfig(id);
        const index = await state.loadChapterIndex(id);
        const nextChapter = await state.getNextChapterNumber(id);

        const approved = index.filter((ch) => ch.status === "approved").length;
        const pending = index.filter(
          (ch) => ch.status === "ready-for-review",
        ).length;
        const failed = index.filter(
          (ch) => ch.status === "audit-failed",
        ).length;

        log(`  ${book.title} (${id})`);
        log(`    Status: ${book.status}`);
        log(`    Platform: ${book.platform} | Genre: ${book.genre}`);
        log(`    Chapters: ${nextChapter - 1} / ${book.targetChapters}`);
        log(`    Approved: ${approved} | Pending: ${pending} | Failed: ${failed}`);
        log("");
      }
    } catch (e) {
      logError(`Failed to get status: ${e}`);
      process.exit(1);
    }
  });
