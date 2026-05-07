#!/usr/bin/env node
import { createCliProgram } from "./cli.js";

await createCliProgram().parseAsync(process.argv);
