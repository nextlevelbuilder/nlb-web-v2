#!/usr/bin/env node
// `npm run courses:publish -- <record-YYMMDD.mp4> --title … --speaker … --description-file …`
// Builds the CLI (and the contracts it imports), then runs `nlb courses publish-recording` with the given arguments.
// Arguments are forwarded as an array, so values with spaces and diacritics survive on Windows too.
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
// A fixed command line (no user input) run through the shell, which resolves npm.cmd on Windows.
const build = spawnSync("npm run build --silent -w @nextlevelbuilder/contracts -w @nextlevelbuilder/cli", { cwd: root, stdio: "inherit", shell: true });
if (build.status !== 0) process.exit(build.status ?? 1);

const { runCli } = await import(pathToFileURL(join(root, "packages/cli/dist/cli.js")).href);
await runCli([process.argv[0], "nlb", "courses", "publish-recording", ...process.argv.slice(2)]);
