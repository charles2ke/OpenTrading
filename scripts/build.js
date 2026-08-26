import { cp, mkdir, rm } from "node:fs/promises";

const files = ["index.html", "manifest.webmanifest", "service-worker.js", "src", "assets"];
await rm("dist", { recursive: true, force: true });
await mkdir("dist");
await Promise.all(files.map((file) => cp(file, `dist/${file}`, { recursive: true })));
console.log("Built OpenTrading into dist/");
