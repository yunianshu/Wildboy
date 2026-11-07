"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const net = require("node:net");
const crypto = require("node:crypto");
const { createProxyServer, closeProxyServer, parseArgs, startProxyServers } = require("../scripts/serve-lan.cjs");

const lanAdmin = "http://192.168.1.189:15173";
const lanApi = "http://192.168.1.189:18080";
const upstreamOrigin = "http://127.0.0.1:15173";
const allowedOrigins = [lanAdmin, lanApi, upstreamOrigin, "http://localhost:15173"];
async function listen(server, host = "127.0.0.1") {
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, host, resolve); });
  return server.address().port;
}
async function fixture(t, handler, options = {}) {
  const upstream = http.createServer(handler);
  const upgraded = new Set();
  upstream.on("connection", (socket) => {
    upgraded.add(socket);
    socket.on("error", () => {});
    socket.on("close", () => upgraded.delete(socket));
  });
  const upstreamPort = await listen(upstream);
  const proxy = createProxyServer({ targetPort: upstreamPort, allowedOrigins, upstreamOrigin, ...options });
  const port = await listen(proxy);
  t.after(async () => {
    await closeProxyServer(proxy);
    for (const socket of upgraded) socket.destroy();
    await new Promise((resolve) => upstream.close(resolve));
  });
  return { upstream, upstreamPort, proxy, port };
}
function request(port, { hostname = "127.0.0.1", method = "GET", headers = {}, path = "/", chunks = [] } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname, port, method, headers, path }, (res) => {
      const body = [];
      res.on("data", (chunk) => body.push(chunk));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(body) }));
      res.on("error", reject);
    });
    req.on("error", reject);
    for (const chunk of chunks) req.write(chunk);
    req.end();
  });
}

test("CLI requires an explicit private address and valid distinct ports", () => {
  assert.deepEqual(parseArgs(["--host", "192.168.1.189"]), { host: "192.168.1.189", apiPort: 18080, adminPort: 15173 });
  assert.deepEqual(parseArgs(["--admin-port", "5002", "--host", "10.1.2.3", "--api-port", "5001"]), { host: "10.1.2.3", apiPort: 5001, adminPort: 5002 });
  assert.deepEqual(parseArgs(["--api-only", "--host", "192.168.1.189", "--api-port", "19080", "--admin-port", "15174"]), { host: "192.168.1.189", apiPort: 19080, adminPort: 15174, apiOnly: true });
  assert.equal(parseArgs(["--host", "192.168.1.189", "--api-only"]).apiOnly, true);
  for (const args of [["--api-only"], ["--host", "192.168.1.189", "--api-only", "false"], ["--host", "192.168.1.189", "--api-only=true"]]) assert.throws(() => parseArgs(args));
  for (const args of [[], ["--host", "0.0.0.0"], ["--host", "127.0.0.1"], ["--host", "198.18.0.1"], ["--host", "example.com"], ["--host", "192.168.1.189", "--api-port", "0"], ["--host", "192.168.1.189", "--api-port", "1.5"], ["--host", "192.168.1.189", "--admin-port", "18080"], ["--host", "192.168.1.189", "--unknown", "x"]]) assert.throws(() => parseArgs(args));
});

test("API-only starts without an admin upstream and preserves an occupied admin listener and its CORS origin", async (t) => {
  const host = "127.0.0.2";
  const upstream = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      assert.equal(req.headers.origin, `http://127.0.0.1:${adminPort}`);
      assert.equal(req.headers.authorization, "Bearer synthetic-api-only");
      res.writeHead(201, { "Access-Control-Allow-Origin": req.headers.origin });
      res.end(Buffer.concat(chunks));
    });
  });
  const apiPort = await listen(upstream);
  const existingAdmin = http.createServer((_req, res) => res.end("existing admin unchanged"));
  const adminPort = await listen(existingAdmin, host);
  t.after(async () => {
    await Promise.all([upstream, existingAdmin].map((server) => new Promise((resolve) => server.close(resolve))));
  });
  await assert.rejects(request(adminPort), { code: "ECONNREFUSED" });
  const running = await startProxyServers({ host, apiPort, adminPort, apiOnly: true });
  t.after(running.close);
  assert.equal(running.servers.length, 1);
  assert.equal(running.servers[0].address().port, apiPort);
  const origin = `http://${host}:${adminPort}`;
  const response = await request(apiPort, { hostname: host, method: "POST", path: "/api/v1/orders",
    headers: { Origin: origin, Authorization: "Bearer synthetic-api-only" }, chunks: [Buffer.from("local fixture body")] });
  assert.equal(response.status, 201);
  assert.equal(response.body.toString(), "local fixture body");
  assert.equal(response.headers["access-control-allow-origin"], origin);
  assert.equal((await request(apiPort, { hostname: host, headers: { Origin: "https://unknown.invalid" } })).status, 403);
  assert.equal((await request(adminPort, { hostname: host })).body.toString(), "existing admin unchanged");
  await running.close();
  assert.equal(existingAdmin.listening, true);
  assert.equal(upstream.listening, true);
});

test("default startup still checks and forwards both loopback services", async (t) => {
  const host = "127.0.0.2";
  const api = http.createServer((_req, res) => res.end("API"));
  const admin = http.createServer((_req, res) => res.end("admin"));
  const apiPort = await listen(api), adminPort = await listen(admin);
  t.after(async () => {
    await Promise.all([api, admin].map((server) => new Promise((resolve) => server.close(resolve))));
  });
  const running = await startProxyServers({ host, apiPort, adminPort });
  t.after(running.close);
  assert.equal(running.servers.length, 2);
  assert.equal((await request(apiPort, { hostname: host })).body.toString(), "API");
  assert.equal((await request(adminPort, { hostname: host })).body.toString(), "admin");
});

test("HTTP streams request bodies, bearer credentials, paths and response statuses", async (t) => {
  const payload = crypto.randomBytes(150000);
  let observed;
  const { port, upstreamPort } = await fixture(t, (req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      observed = { method: req.method, path: req.url, headers: req.headers, body: Buffer.concat(chunks) };
      res.writeHead(201, { "Content-Type": "application/octet-stream", "X-Upstream": "preserved" });
      res.end(observed.body);
    });
  });
  const result = await request(port, { method: "POST", path: "/api/v1/orders?q=%E5%B1%B1", headers: { Authorization: "Bearer synthetic-qa-token", "Content-Type": "application/octet-stream" }, chunks: [payload.subarray(0, 777), payload.subarray(777)] });
  assert.equal(result.status, 201);
  assert.deepEqual(result.body, payload);
  assert.deepEqual(observed.body, payload);
  assert.equal(observed.method, "POST");
  assert.equal(observed.path, "/api/v1/orders?q=%E5%B1%B1");
  assert.equal(observed.headers.authorization, "Bearer synthetic-qa-token");
  assert.equal(observed.headers.host, `127.0.0.1:${upstreamPort}`);
  assert.equal(result.headers["x-upstream"], "preserved");
  assert.equal(result.headers["access-control-allow-origin"], undefined);
});

test("CORS maps only the explicit origins and preserves preflight restrictions", async (t) => {
  const { port } = await fixture(t, (req, res) => {
    assert.equal(req.headers.origin, upstreamOrigin);
    assert.equal(req.headers["access-control-request-method"], "PUT");
    assert.equal(req.headers["access-control-request-headers"], "authorization,content-type");
    res.writeHead(204, { "Access-Control-Allow-Origin": upstreamOrigin, "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS", "Access-Control-Allow-Headers": "authorization,content-type", Vary: "Accept-Encoding" });
    res.end();
  });
  for (const origin of allowedOrigins) {
    const result = await request(port, { method: "OPTIONS", headers: { Origin: origin, "Access-Control-Request-Method": "PUT", "Access-Control-Request-Headers": "authorization,content-type" } });
    assert.equal(result.status, 204);
    assert.equal(result.headers["access-control-allow-origin"], origin);
    assert.equal(result.headers["access-control-allow-headers"], "authorization,content-type");
    assert.match(result.headers.vary, /Accept-Encoding/);
    assert.match(result.headers.vary, /Origin/);
  }
});

test("unknown, null and lookalike origins never reach the upstream", async (t) => {
  let count = 0;
  const { port } = await fixture(t, (_req, res) => { count++; res.end("ok"); });
  for (const origin of ["", "null", "https://attacker.invalid", `${lanAdmin}.attacker.invalid`, "http://192.168.1.189:15174", "http://192.168.1.189:15173/"]) {
    for (const method of ["GET", "POST", "OPTIONS"]) {
      const result = await request(port, { method, headers: { Origin: origin } });
      assert.equal(result.status, 403);
      assert.equal(result.headers["access-control-allow-origin"], undefined);
    }
  }
  assert.equal(count, 0);
  assert.equal((await request(port)).status, 200);
  assert.equal(count, 1);
});

test("the LAN listener rejects a spoofed Host even when Origin is absent", async (t) => {
  let count = 0;
  const authority = "192.168.1.189:18080";
  const { port } = await fixture(t, (_req, res) => { count++; res.end(); }, { authority });
  assert.equal((await request(port, { headers: { Host: "attacker.invalid:18080" } })).status, 403);
  assert.equal(count, 0);
  assert.equal((await request(port, { headers: { Host: authority } })).status, 200);
  assert.equal(count, 1);
});

test("upstream authentication failures stay failures with LAN-readable error bodies", async (t) => {
  const { port } = await fixture(t, (_req, res) => { res.writeHead(401, { "Content-Type": "application/json" }); res.end('{"code":"UNAUTHENTICATED"}'); });
  const result = await request(port, { headers: { Origin: lanAdmin } });
  assert.equal(result.status, 401);
  assert.equal(result.headers["access-control-allow-origin"], lanAdmin);
  assert.equal(JSON.parse(result.body).code, "UNAUTHENTICATED");
});

test("unavailable and stalled upstreams produce bounded 502 errors", async (t) => {
  const { port, upstream } = await fixture(t, () => {}, { timeoutMs: 30 });
  const timeout = await request(port, { headers: { Origin: lanAdmin } });
  assert.equal(timeout.status, 502);
  assert.equal(JSON.parse(timeout.body).code, "UPSTREAM_UNAVAILABLE");
  upstream.closeAllConnections();
  await new Promise((resolve) => upstream.close(resolve));
  const unavailable = await request(port);
  assert.equal(unavailable.status, 502);
  assert.equal(JSON.parse(unavailable.body).code, "UPSTREAM_UNAVAILABLE");
});

test("Vite-style WebSocket upgrades preserve protocols, auth, handshake bytes and live traffic", async (t) => {
  const { port, upstream, upstreamPort, proxy } = await fixture(t, (_req, res) => res.end("upstream still running"));
  const first = Buffer.from([0x89, 0x80, 1, 2, 3, 4]);
  const second = Buffer.from([0x81, 0x82, 1, 2, 3, 4, 0x69, 0x6b]);
  const hello = Buffer.from([0x81, 5, ...Buffer.from("hello")]);
  const pong = Buffer.from([0x8a, 0]);
  const ack = Buffer.from([0x81, 3, ...Buffer.from("ack")]);
  let seen = 0;
  upstream.on("upgrade", (req, socket, head) => {
    assert.equal(req.headers.origin, upstreamOrigin);
    assert.equal(req.headers.authorization, "Bearer ws-test-only");
    assert.equal(req.headers["sec-websocket-protocol"], "vite-hmr");
    assert.equal(req.url, "/?token=synthetic");
    const accept = crypto.createHash("sha1").update(req.headers["sec-websocket-key"] + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").digest("base64");
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Accept: ${accept}\r\nSec-WebSocket-Protocol: vite-hmr\r\n\r\n`);
    socket.write(hello);
    assert.equal(head.length, 0);
    let pending = Buffer.alloc(0);
    socket.on("data", (data) => {
      pending = Buffer.concat([pending, data]);
      const expected = seen === 0 ? first : second;
      if (pending.length < expected.length) return;
      assert.deepEqual(pending.subarray(0, expected.length), expected);
      pending = pending.subarray(expected.length);
      socket.write(++seen === 1 ? pong : ack);
    });
  });
  const socket = net.connect(port, "127.0.0.1");
  t.after(() => socket.destroy());
  const received = await new Promise((resolve, reject) => {
    let bytes = Buffer.alloc(0), sent = false;
    const timer = setTimeout(() => reject(new Error("WebSocket tunnel stalled")), 2000);
    socket.on("error", reject);
    socket.on("data", (data) => {
      bytes = Buffer.concat([bytes, data]);
      if (!sent && bytes.includes(pong)) { sent = true; socket.write(second); }
      if (bytes.includes(ack)) { clearTimeout(timer); resolve(bytes); }
    });
    socket.on("connect", () => socket.write(Buffer.concat([Buffer.from(`GET /?token=synthetic HTTP/1.1\r\nHost: localhost:${port}\r\nOrigin: ${lanAdmin}\r\nAuthorization: Bearer ws-test-only\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Protocol: vite-hmr\r\n\r\n`), first])));
  });
  assert.match(received.toString(), /^HTTP\/1.1 101/);
  assert.match(received.toString(), /sec-websocket-protocol: vite-hmr/i);
  assert.ok(received.includes(hello));
  assert.equal(seen, 2);
  const closed = new Promise((resolve) => socket.once("close", resolve));
  await closeProxyServer(proxy);
  await closed;
  assert.equal((await request(upstreamPort)).body.toString(), "upstream still running");
});

test("unapproved WebSocket origins are rejected before any upgrade reaches the upstream", async (t) => {
  const { port, upstream } = await fixture(t, (_req, res) => res.end());
  let upgrades = 0;
  upstream.on("upgrade", (_req, socket) => { upgrades++; socket.destroy(); });
  const response = await new Promise((resolve, reject) => {
    const socket = net.connect(port, "127.0.0.1");
    let bytes = "";
    socket.setEncoding("utf8");
    socket.on("error", reject);
    socket.on("data", (chunk) => bytes += chunk);
    socket.on("end", () => resolve(bytes));
    socket.on("connect", () => socket.write("GET / HTTP/1.1\r\nHost: localhost\r\nOrigin: https://attacker.invalid\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n"));
  });
  assert.match(response, /^HTTP\/1.1 403/);
  assert.equal(upgrades, 0);
});
