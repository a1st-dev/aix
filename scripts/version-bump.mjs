#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { execSync, spawnSync } from "node:child_process";

const version = process.argv[2];
const semverPattern =
   /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

if (!version || !semverPattern.test(version)) {
   console.error("Usage: npm run version:bump -- <semver-without-v>");
   console.error("Example: npm run version:bump -- 1.2.3");
   process.exit(1);
}

function run(command, args, options = {}) {
   execSync(`${command} ${args.join(" ")}`, {
      stdio: "inherit",
      ...options,
   });
}

function findFiles(rootDir, targetFileName, ignoredDirs) {
   const found = [];
   const queue = [rootDir];

   while (queue.length > 0) {
      const current = queue.shift();
      const entries = fs.readdirSync(current, { withFileTypes: true });
      for (const entry of entries) {
         const fullPath = path.join(current, entry.name);
         if (entry.isDirectory()) {
            if (ignoredDirs.has(entry.name)) {
               continue;
            }
            queue.push(fullPath);
            continue;
         }
         if (entry.isFile() && entry.name === targetFileName) {
            found.push(fullPath);
         }
      }
   }

   return found;
}

function updateCargoManifestVersion(manifestPath, nextVersion) {
   const original = fs.readFileSync(manifestPath, "utf8");
   const lines = original.split("\n");
   let section = "";
   let changed = false;

   for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      const sectionMatch = line.match(/^\s*\[([^\]]+)\]\s*$/);
      if (sectionMatch) {
         section = sectionMatch[1].trim();
         continue;
      }

      if (section !== "package" && section !== "workspace.package") {
         continue;
      }

      const versionMatch = line.match(/^(\s*version\s*=\s*)"([^"]+)"(\s*(#.*)?)$/);
      if (!versionMatch) {
         continue;
      }

      if (versionMatch[2] === nextVersion) {
         continue;
      }

      lines[i] = `${versionMatch[1]}"${nextVersion}"${versionMatch[3]}`;
      changed = true;
   }

   if (changed) {
      fs.writeFileSync(manifestPath, lines.join("\n"));
   }

   return changed;
}

function toPosixPath(filePath) {
   return filePath.replaceAll("\\", "/");
}

function detectWorkspaceRoots(cargoTomls) {
   const roots = [];
   const rootSet = new Set();

   for (const manifestPath of cargoTomls) {
      const content = fs.readFileSync(manifestPath, "utf8");
      if (!/^\s*\[workspace\]\s*$/m.test(content)) {
         continue;
      }
      const dir = path.dirname(manifestPath);
      if (!rootSet.has(dir)) {
         rootSet.add(dir);
         roots.push(dir);
      }
   }

   if (roots.length > 0) {
      return roots;
   }

   for (const manifestPath of cargoTomls) {
      const dir = path.dirname(manifestPath);
      if (!rootSet.has(dir)) {
         rootSet.add(dir);
         roots.push(dir);
      }
   }

   return roots;
}

function bumpNpmVersions(nextVersion) {
   run("npm", [
      "version",
      nextVersion,
      "--no-git-tag-version",
      "--allow-same-version",
      "--workspaces",
      "--include-workspace-root",
   ]);

   const ignoredDirs = new Set([".git", "node_modules", "target"]);
   const lockFiles = findFiles(process.cwd(), "package-lock.json", ignoredDirs);
   const rootLockPath = path.join(process.cwd(), "package-lock.json");
   let nestedProcessed = 0;
   for (const lockPath of lockFiles) {
      if (path.resolve(lockPath) === path.resolve(rootLockPath)) {
         continue;
      }

      const lockDir = path.dirname(lockPath);
      const packageJsonPath = path.join(lockDir, "package.json");
      if (!fs.existsSync(packageJsonPath)) {
         continue;
      }

      run("npm", [
         "version",
         nextVersion,
         "--no-git-tag-version",
         "--allow-same-version",
      ], { cwd: lockDir });
      nestedProcessed += 1;
   }

   console.log(
      `NPM version bump complete. package-lock.json found: ${lockFiles.length}, nested lockfile projects processed: ${nestedProcessed}`
   );
   return { lockfilesFound: lockFiles.length, nestedProcessed };
}

function bumpCargoVersions(nextVersion) {
   const ignoredDirs = new Set([".git", "node_modules", "target"]);
   const cargoTomls = findFiles(process.cwd(), "Cargo.toml", ignoredDirs);
   const cargoLocks = findFiles(process.cwd(), "Cargo.lock", ignoredDirs);

   if (cargoTomls.length === 0 && cargoLocks.length === 0) {
      console.log("No Cargo.toml/Cargo.lock files found. Skipping Rust version bump.");
      return { manifests: 0, lockfiles: 0, workspacesChanged: 0 };
   }

   const cargoVersionCheck = spawnSync("cargo", ["--version"], { stdio: "ignore" });
   if (cargoVersionCheck.status !== 0) {
      throw new Error("Cargo files found but `cargo` is not available in PATH.");
   }

   const workspaceRoots = detectWorkspaceRoots(cargoTomls);
   let changedWorkspaces = 0;

   for (const workspaceRoot of workspaceRoots) {
      const metadataRaw = execSync("cargo metadata --no-deps --format-version 1", {
         cwd: workspaceRoot,
         encoding: "utf8",
      });
      const metadata = JSON.parse(metadataRaw);
      const workspaceMembers = new Set(metadata.workspace_members);
      const memberManifests = metadata.packages
         .filter((pkg) => workspaceMembers.has(pkg.id))
         .map((pkg) => toPosixPath(pkg.manifest_path));

      let changedAny = false;
      for (const manifestPath of memberManifests) {
         const changed = updateCargoManifestVersion(manifestPath, nextVersion);
         changedAny = changedAny || changed;
      }

      const rootManifest = path.join(workspaceRoot, "Cargo.toml");
      if (fs.existsSync(rootManifest)) {
         const changedRoot = updateCargoManifestVersion(rootManifest, nextVersion);
         changedAny = changedAny || changedRoot;
      }

      if (changedAny) {
         run("cargo", ["generate-lockfile"], { cwd: workspaceRoot });
         changedWorkspaces += 1;
      }
   }

   console.log(
      `Cargo files found: ${cargoTomls.length} manifest(s), ${cargoLocks.length} lockfile(s), updated workspaces: ${changedWorkspaces}`
   );
   return {
      manifests: cargoTomls.length,
      lockfiles: cargoLocks.length,
      workspacesChanged: changedWorkspaces,
   };
}

try {
   const npmResult = bumpNpmVersions(version);
   const cargoResult = bumpCargoVersions(version);
   console.log(
      `Summary: npm lockfiles found ${npmResult.lockfilesFound}, nested npm projects processed ${npmResult.nestedProcessed}, cargo workspaces updated ${cargoResult.workspacesChanged}`
   );
   console.log(`Version bump complete: ${version}`);
} catch (error) {
   console.error(error.message);
   process.exit(1);
}
