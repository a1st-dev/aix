#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const expectedVersion = process.argv[2];

if (!expectedVersion) {
   console.error("Usage: node ./scripts/verify-release-versions.mjs <version>");
   process.exit(1);
}

const targets = ["package.json"];
for (const entry of fs.readdirSync("packages", { withFileTypes: true })) {
   if (!entry.isDirectory()) {
      continue;
   }
   const packageJsonPath = path.join("packages", entry.name, "package.json");
   if (fs.existsSync(packageJsonPath)) {
      targets.push(packageJsonPath);
   }
}

const mismatches = [];
for (const filePath of targets) {
   const content = fs.readFileSync(filePath, "utf8");
   const version = JSON.parse(content).version;
   if (version !== expectedVersion) {
      mismatches.push(`${filePath}: ${version} (expected ${expectedVersion})`);
   }
}

if (mismatches.length > 0) {
   console.error("Version mismatch with release tag:");
   for (const mismatch of mismatches) {
      console.error(`- ${mismatch}`);
   }
   process.exit(1);
}

console.log(`All package.json versions match ${expectedVersion}.`);
