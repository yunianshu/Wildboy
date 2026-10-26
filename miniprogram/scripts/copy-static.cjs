const fs = require("node:fs"),
  path = require("node:path");
function cp(d) {
  for (const x of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, x.name);
    if (x.isDirectory()) cp(p);
    else if (!p.endsWith(".ts")) {
      const out = path.join("dist", path.relative("src", p));
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.copyFileSync(p, out);
    }
  }
}
cp("src");
