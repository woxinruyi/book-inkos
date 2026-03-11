import { Command } from "commander";
import { PipelineRunner } from "@inkos/core";
import { loadConfig, createClient, findProjectRoot, log, logError } from "../utils.js";

export const writeCommand = new Command("write")
  .description("Write chapters");

writeCommand
  .command("next")
  .description("Write the next chapter for a book")
  .argument("<book-id>", "Book ID")
  .option("--count <n>", "Number of chapters to write", "1")
  .action(async (bookId: string, opts) => {
    try {
      const config = await loadConfig();
      const client = createClient(config);
      const root = findProjectRoot();

      const pipeline = new PipelineRunner({
        client,
        model: config.llm.model,
        projectRoot: root,
        notifyChannels: config.notify,
      });

      const count = parseInt(opts.count, 10);

      for (let i = 0; i < count; i++) {
        log(`Writing chapter for "${bookId}"...`);

        const result = await pipeline.writeNextChapter(bookId);

        log(`  Chapter ${result.chapterNumber}: ${result.title}`);
        log(`  Words: ${result.wordCount}`);
        log(`  Audit: ${result.auditResult.passed ? "PASSED" : "NEEDS REVIEW"}`);
        if (result.revised) {
          log("  Auto-revised: YES (critical issues were fixed)");
        }
        log(`  Status: ${result.status}`);

        if (result.auditResult.issues.length > 0) {
          log("  Issues:");
          for (const issue of result.auditResult.issues) {
            log(`    [${issue.severity}] ${issue.category}: ${issue.description}`);
          }
        }

        log("");
      }

      log("Done.");
    } catch (e) {
      logError(`Failed to write chapter: ${e}`);
      process.exit(1);
    }
  });
