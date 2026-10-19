const { execFileSync } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const distDir = path.join(root, "dist");
fs.mkdirSync(distDir, { recursive: true });

const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
const version = manifest.version || "1.0.0";
const zipName = `notebooklm-concurrency-unlocker-v${version}.zip`;
const zipPath = path.join(distDir, zipName);

if (fs.existsSync(zipPath)) {
  fs.unlinkSync(zipPath);
}

const entries = [
  "manifest.json",
  "_locales",
  "icons",
  "lib",
  "background.js",
  "content.js",
  "inpage.js",
  "popup.html",
  "popup.js",
  "styles.css"
];

for (const entry of entries) {
  const p = path.join(root, entry);
  if (!fs.existsSync(p)) {
    throw new Error(`Required package entry missing: ${entry}`);
  }
}

execFileSync("zip", ["-r", "-q", zipPath, ...entries], { cwd: root });

const bytes = fs.readFileSync(zipPath);
const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");

console.log(`Package created: ${zipPath}`);
console.log(`Size: ${(bytes.length / 1024).toFixed(1)} KB`);
console.log(`SHA-256: ${sha256}`);
