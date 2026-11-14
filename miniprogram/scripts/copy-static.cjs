const fs = require("node:fs"),
  path = require("node:path");
const { packOptions } = require("../project.config.json");
const excludedFiles = new Set(
  packOptions.ignore
    .filter(({ type }) => type === "file")
    .map(({ value }) => path.normalize(value)),
);
function cp(d) {
  for (const x of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, x.name);
    if (x.isDirectory()) cp(p);
    else if (!p.endsWith(".ts")) {
      const relative = path.relative("src", p);
      if (excludedFiles.has(relative)) continue;
      const out = path.join("dist", relative);
      fs.mkdirSync(path.dirname(out), { recursive: true });
      // Preserve the full-resolution artwork in src and serve the 720px PNG
      // at the same runtime path for the 216px homepage logo.
      const asset = relative === path.join("assets", "platform-brand-original-transparent.png")
        ? path.join(__dirname, "../assets/platform-brand-720.png")
        : p;
      fs.copyFileSync(asset, out);
    }
  }
}
cp("src");
