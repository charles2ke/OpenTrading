import { readFile, writeFile } from "node:fs/promises";

const path = "README.md";
const start = "<!-- release-status:start -->";
const end = "<!-- release-status:end -->";
const readme = await readFile(path, "utf8");
const mergedPullRequest = process.env.MERGED_PR;
if (!mergedPullRequest || !/^\d+$/.test(mergedPullRequest)) throw new Error("MERGED_PR must be a pull request number.");
const status = `${start}\nLatest merged pull request: #${mergedPullRequest}\n${end}`;
const nextReadme = readme.replace(new RegExp(`${start}[\\s\\S]*?${end}`), status);
if (nextReadme === readme) throw new Error("README release-status markers were not found.");
await writeFile(path, nextReadme);
