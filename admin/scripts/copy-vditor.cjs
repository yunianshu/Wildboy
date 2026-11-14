// 自托管 Vditor 静态资源：dev 由 Vite publicDir 直接伺服，构建时随 public/ 进 dist。
// 由 admin 的 postinstall 生命周期调用；资源不入库（见 .gitignore）。
const { cpSync, existsSync, mkdirSync, statSync } = require("node:fs");
const { join } = require("node:path");

const src = join(__dirname, "..", "node_modules", "vditor", "dist");
const dest = join(__dirname, "..", "public", "vditor", "dist");

if (!existsSync(src)) {
  console.warn("[copy-vditor] node_modules/vditor 不存在，跳过（先 npm install）");
  process.exit(0);
}
if (existsSync(dest) && statSync(src).mtimeMs <= statSync(dest).mtimeMs) {
  process.exit(0); // 已是最新
}
mkdirSync(dest, { recursive: true });
cpSync(src, dest, { recursive: true });
console.log("[copy-vditor] 已更新 public/vditor");
