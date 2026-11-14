const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

test("upload validates the built origin and login mode before loading the WeChat SDK", (t) => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), "wildboy-upload-config-"));
  t.after(() => fs.rmSync(project, { recursive: true, force: true }));
  const script = path.join(project, "scripts", "upload.cjs");
  const builtConfig = path.join(project, "dist", "config.js");
  fs.mkdirSync(path.dirname(script));
  fs.mkdirSync(path.dirname(builtConfig));
  fs.copyFileSync(path.resolve(__dirname, "../scripts/upload.cjs"), script);
  const check = () => spawnSync(process.execPath, [script, "--check-config"], {
    cwd: path.dirname(script),
    encoding: "utf8",
  });
  const config = { apiOrigin: "https://api.wildboy.com.cn", devLogin: false };
  const writeConfig = (value) => fs.writeFileSync(builtConfig,
    "exports.config = " + JSON.stringify(value));

  const missing = check();
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /无法读取 dist\/config\.js/);

  writeConfig(config);
  const valid = check();
  assert.equal(valid.status, 0, valid.stderr);
  assert.match(valid.stdout, /上传配置校验通过/);

  for (const value of [
    { ...config, apiOrigin: "https://api.example.invalid" },
    { ...config, apiOrigin: "http://api.wildboy.com.cn" },
    { ...config, apiOrigin: "http://192.168.1.3:19080", devLogin: true },
    { ...config, apiOrigin: config.apiOrigin + "/api/v1" },
    { ...config, apiOrigin: config.apiOrigin + ".example.invalid" },
    { ...config, devLogin: true },
    { apiOrigin: config.apiOrigin },
  ]) {
    writeConfig(value);
    const rejected = check();
    assert.equal(rejected.status, 1);
    assert.match(rejected.stderr, /上传包必须使用/);
  }
});
