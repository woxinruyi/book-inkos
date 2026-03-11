import { Command } from "commander";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { findProjectRoot, log, logError } from "../utils.js";

export const configCommand = new Command("config")
  .description("Manage project configuration");

configCommand
  .command("set")
  .description("Set a configuration value")
  .argument("<key>", "Config key (e.g., llm.apiKey)")
  .argument("<value>", "Config value")
  .action(async (key: string, value: string) => {
    const root = findProjectRoot();
    const configPath = join(root, "inkos.json");

    try {
      const raw = await readFile(configPath, "utf-8");
      const config = JSON.parse(raw);

      const keys = key.split(".");
      let target = config;
      for (let i = 0; i < keys.length - 1; i++) {
        const k = keys[i]!;
        if (!(k in target)) {
          target[k] = {};
        }
        target = target[k];
      }
      target[keys[keys.length - 1]!] = value;

      await writeFile(configPath, JSON.stringify(config, null, 2), "utf-8");
      log(`Set ${key} = ${value}`);
    } catch (e) {
      logError(`Failed to update config: ${e}`);
      process.exit(1);
    }
  });

configCommand
  .command("show")
  .description("Show current configuration")
  .action(async () => {
    const root = findProjectRoot();
    const configPath = join(root, "inkos.json");

    try {
      const raw = await readFile(configPath, "utf-8");
      const config = JSON.parse(raw);
      // Mask API key
      if (config.llm?.apiKey) {
        const key = config.llm.apiKey;
        config.llm.apiKey = key.slice(0, 8) + "..." + key.slice(-4);
      }
      log(JSON.stringify(config, null, 2));
    } catch (e) {
      logError(`Failed to read config: ${e}`);
      process.exit(1);
    }
  });
