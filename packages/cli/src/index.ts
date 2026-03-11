#!/usr/bin/env node

import { Command } from "commander";
import { initCommand } from "./commands/init.js";
import { configCommand } from "./commands/config.js";
import { bookCommand } from "./commands/book.js";
import { writeCommand } from "./commands/write.js";
import { reviewCommand } from "./commands/review.js";
import { statusCommand } from "./commands/status.js";
import { radarCommand } from "./commands/radar.js";
import { upCommand, downCommand } from "./commands/daemon.js";
import { doctorCommand } from "./commands/doctor.js";

const program = new Command();

program
  .name("inkos")
  .description("InkOS — Multi-agent novel production system")
  .version("0.1.0");

program.addCommand(initCommand);
program.addCommand(configCommand);
program.addCommand(bookCommand);
program.addCommand(writeCommand);
program.addCommand(reviewCommand);
program.addCommand(statusCommand);
program.addCommand(radarCommand);
program.addCommand(upCommand);
program.addCommand(downCommand);
program.addCommand(doctorCommand);

program.parse();
