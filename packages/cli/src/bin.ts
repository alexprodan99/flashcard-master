#!/usr/bin/env node
import { createCli } from "./cli.js";

const cli = createCli();
cli.parseAsync(process.argv).catch((err) => {
  console.error("Fatal CLI Error:", err);
  process.exit(1);
});
