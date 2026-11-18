const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const root = path.resolve(__dirname, "../src");
const read = p => fs.readFileSync(path.join(root, p), "utf8").replace(/\r\n/g, "\n");
const hash = s => crypto.createHash("sha256").update(s).digest("hex");
// Baseline captured before the A palette migration; protects original behavior/layout.
const protectedFiles = {
  "pages/home/index.ts": "edf6417b1d59779109682e1f53e324762e9773b2da21b3d2b1a6fa9e9068fa41",
  "pages/home/index.wxml": "5a21a8f16f71889d628cd161bc32dd63c1b26b41d1c22bca02790f5e3aa4f1fd",
  "pages/home/index.json": "5983938690a29e5e0c2c102a4d679490c6642acaa5b7db74d517b7785c686f12",
  "custom-tab-bar/index.ts": "a9747f588099ea16f0891c2e32b93f985990f2aec7eace78febe0381536d9730",
  "custom-tab-bar/index.wxml": "a4eee778aa15c73f03f5d642cac763afd3550ddb075f383f281d09c05d546b76",
  "styles/motion.wxss": "e44ccd63751deaf59ca0c70b4e147354759a58298dac02f29351f2fb7b56437b"
};
const protectedLayouts = {
  "pages/home/index.wxss": "356ffc4bd9febed4d328d868da8695c53f55fc73532f6088a70a52066b118bcd",
  "custom-tab-bar/index.wxss": "ad9011267cd91c372d14dcbd606925146042c64bf8db616b99b880b723084f9a",
  "app.wxss": "037600165cb1510c704d8b44b673b28f994f057704c9951f87a5b25d033eded8",
  "components/ui-state/index.wxss": "88a85d7ba144fc562dbc208aea491020a62588c04db6d3fa3b1b61e65c3846f2"
};
test("A refresh preserves home behavior, tab navigation and the in-place fade", () => {
  for (const [file, expected] of Object.entries(protectedFiles)) assert.equal(hash(read(file)), expected, file);
});
test("home and shared presentation change only color literals", () => {
  for (const [file, expected] of Object.entries(protectedLayouts)) {
    const layout = read(file).replace(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/g, "COLOR");
    assert.equal(hash(layout), expected, file);
  }
});
test("native page chrome and controls use A instead of berry", () => {
  function check(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) check(file);
      else if (/\.(wxss|json|wxml)$/.test(file)) assert.doesNotMatch(fs.readFileSync(file, "utf8"), /#(?:B93858|9E2845|FFFAFB|FDEEF1)\b/i, file);
    }
  }
  check(root);
  const app = JSON.parse(read("app.json"));
  assert.equal(app.window.backgroundColor, "#F6F8F3");
  assert.equal(app.window.navigationBarBackgroundColor, "#F6F8F3");
});
