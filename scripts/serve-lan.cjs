#!/usr/bin/env node
"use strict";

// Development bridge: the existing loopback services and their data stay in place.
const http = require("node:http");
const net = require("node:net");
const os = require("node:os");
const connections = new WeakMap();
const hopHeaders = new Set(["connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "te", "trailer", "transfer-encoding", "upgrade"]);

function forwardHeaders(headers, websocket = false) {
  const excluded = new Set([...hopHeaders, ...String(headers.connection || "").toLowerCase().split(",").map((value) => value.trim())]);
  const result = Object.fromEntries(Object.entries(headers).filter(([name]) => !excluded.has(name.toLowerCase())));
  if (websocket) Object.assign(result, { connection: "Upgrade", upgrade: "websocket" });
  return result;
}

function responseHeaders(headers, origin, websocket = false) {
  const result = forwardHeaders(headers, websocket);
  delete result["access-control-allow-origin"];
  const vary = String(result.vary || "").split(",").map((value) => value.trim()).filter(Boolean);
  if (!vary.some((value) => value.toLowerCase() === "origin")) vary.push("Origin");
  result.vary = vary.join(", ");
  if (origin) result["access-control-allow-origin"] = origin;
  return result;
}

function errorBody(code) {
  return JSON.stringify({ code, message: code === "ORIGIN_NOT_ALLOWED" ? "Origin is not allowed by the development LAN proxy" : "Development upstream is unavailable" });
}

function socketResponse(socket, status, headers, body = "") {
  const lines = [`HTTP/1.1 ${status} ${http.STATUS_CODES[status] || "Response"}`];
  for (const [name, value] of Object.entries(headers)) {
    for (const item of Array.isArray(value) ? value : [value]) lines.push(`${name}: ${item}`);
  }
  socket.write(lines.join("\r\n") + "\r\n\r\n" + body);
}

function createProxyServer({ targetPort, allowedOrigins, upstreamOrigin, authority, timeoutMs = 60000 }) {
  if (!Number.isInteger(targetPort) || targetPort < 1 || targetPort > 65535) throw new Error("Invalid upstream port");
  const origins = new Set(allowedOrigins);
  const sockets = new Set();
  const upgraded = new Set();
  const accepted = (req) => (req.headers.origin === undefined || origins.has(req.headers.origin))
    && (!authority || req.headers.host === authority)
    && req.url.startsWith("/");
  const requestHeaders = (req, websocket = false) => {
    const headers = forwardHeaders(req.headers, websocket);
    headers.host = `127.0.0.1:${targetPort}`;
    if (req.headers.origin) headers.origin = upstreamOrigin;
    return headers;
  };
  const server = http.createServer((req, res) => {
    if (!accepted(req)) {
      res.writeHead(403, { "Content-Type": "application/json", "Cache-Control": "no-store", Vary: "Origin" });
      res.end(errorBody("ORIGIN_NOT_ALLOWED"));
      req.resume();
      return;
    }
    const upstream = http.request({ hostname: "127.0.0.1", port: targetPort, path: req.url, method: req.method, headers: requestHeaders(req) }, (reply) => {
      res.writeHead(reply.statusCode, responseHeaders(reply.headers, req.headers.origin));
      reply.on("error", () => res.destroy());
      reply.pipe(res);
    });
    upstream.setTimeout(timeoutMs, () => upstream.destroy(new Error("Upstream timeout")));
    upstream.on("error", () => {
      if (res.headersSent) return res.destroy();
      res.writeHead(502, responseHeaders({ "content-type": "application/json", "cache-control": "no-store" }, req.headers.origin));
      res.end(errorBody("UPSTREAM_UNAVAILABLE"));
    });
    req.on("aborted", () => upstream.destroy());
    req.on("error", () => upstream.destroy());
    res.on("close", () => { if (!res.writableEnded) upstream.destroy(); });
    req.pipe(upstream);
  });
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("error", () => {});
    socket.on("close", () => sockets.delete(socket));
  });
  server.on("upgrade", (req, socket, head) => {
    if (!accepted(req) || req.method !== "GET" || String(req.headers.upgrade).toLowerCase() !== "websocket") {
      const body = errorBody("ORIGIN_NOT_ALLOWED");
      socketResponse(socket, 403, { Connection: "close", "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) }, body);
      socket.end();
      return;
    }
    const upstream = http.request({ hostname: "127.0.0.1", port: targetPort, path: req.url, method: "GET", headers: requestHeaders(req, true) });
    upstream.setTimeout(timeoutMs, () => upstream.destroy(new Error("Upgrade timeout")));
    upstream.on("upgrade", (reply, peer, peerHead) => {
      upgraded.add(peer);
      peer.on("close", () => { upgraded.delete(peer); socket.destroy(); });
      peer.on("error", () => socket.destroy());
      socket.on("close", () => peer.destroy());
      peer.setTimeout(0);
      socketResponse(socket, reply.statusCode, responseHeaders(reply.headers, req.headers.origin, true));
      if (peerHead.length) socket.write(peerHead);
      if (head.length) peer.write(head);
      peer.pipe(socket);
      socket.pipe(peer);
    });
    upstream.on("response", (reply) => {
      socketResponse(socket, reply.statusCode, { ...responseHeaders(reply.headers, req.headers.origin), connection: "close" });
      reply.on("error", () => socket.destroy());
      reply.pipe(socket);
    });
    upstream.on("error", () => {
      if (!socket.destroyed) {
        const body = errorBody("UPSTREAM_UNAVAILABLE");
        socketResponse(socket, 502, { Connection: "close", "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) }, body);
        socket.end();
      }
    });
    socket.on("close", () => upstream.destroy());
    upstream.end();
  });
  connections.set(server, { sockets, upgraded });
  return server;
}

async function closeProxyServer(server) {
  const tracked = connections.get(server);
  for (const socket of tracked?.upgraded || []) socket.destroy();
  await new Promise((resolve) => {
    const timer = setTimeout(() => { for (const socket of tracked?.sockets || []) socket.destroy(); }, 1000);
    timer.unref();
    server.close(() => { clearTimeout(timer); resolve(); });
    server.closeIdleConnections();
  });
}

function parseArgs(argv) {
  const options = { apiPort: 18080, adminPort: 15173 };
  const names = { "--host": "host", "--api-port": "apiPort", "--admin-port": "adminPort" };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--api-only") {
      options.apiOnly = true;
      continue;
    }
    const key = names[argv[i]];
    if (!key || !argv[i + 1]) throw new Error("Usage: node scripts/serve-lan.cjs --host <local LAN IPv4> [--api-port 18080] [--admin-port 15173] [--api-only]");
    const value = argv[++i];
    if (key === "host") options.host = value;
    else {
      if (!/^\d+$/.test(value) || +value < 1 || +value > 65535) throw new Error("Ports must be integers from 1 to 65535");
      options[key] = +value;
    }
  }
  if (net.isIP(options.host || "") !== 4 || !/^(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(options.host)) throw new Error("--host must explicitly name a private LAN IPv4 address");
  if (options.apiPort === options.adminPort) throw new Error("API and admin ports must differ");
  return options;
}

function upstreamReady(port) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, "127.0.0.1");
    socket.setTimeout(2500, () => socket.destroy(new Error("timeout")));
    socket.once("connect", () => { socket.destroy(); resolve(); });
    socket.once("error", () => reject(new Error(`Loopback upstream 127.0.0.1:${port} is unavailable`)));
  });
}

async function startProxyServers({ host, apiPort, adminPort, apiOnly = false }) {
  const ports = apiOnly ? [apiPort] : [apiPort, adminPort];
  await Promise.all(ports.map(upstreamReady));
  const upstreamOrigin = `http://127.0.0.1:${adminPort}`;
  const allowedOrigins = [`http://${host}:${apiPort}`, `http://${host}:${adminPort}`, upstreamOrigin, `http://localhost:${adminPort}`];
  const servers = ports.map((port) => createProxyServer({ targetPort: port, allowedOrigins, upstreamOrigin, authority: `${host}:${port}` }));
  try {
    for (let i = 0; i < servers.length; i++) {
      await new Promise((resolve, reject) => {
        servers[i].once("error", reject);
        servers[i].listen(ports[i], host, () => { servers[i].removeListener("error", reject); resolve(); });
      });
    }
  } catch (error) {
    await Promise.all(servers.map(closeProxyServer));
    throw error;
  }
  let closing;
  const close = () => closing ||= Promise.all(servers.map(closeProxyServer));
  for (const server of servers) server.on("error", (error) => { console.error(`LAN proxy: ${error.code || "listener error"}`); process.exitCode = 1; void close(); });
  return { servers, close };
}

async function main(argv) {
  const options = parseArgs(argv);
  const { host, apiPort, adminPort, apiOnly } = options;
  if (!Object.values(os.networkInterfaces()).flat().some((entry) => entry && !entry.internal && entry.address === host)) throw new Error("The specified LAN address is not assigned to this computer");
  const running = await startProxyServers(options);
  const { close } = running;
  process.once("SIGINT", close);
  process.once("SIGTERM", close);
  console.log(`LAN API: http://${host}:${apiPort}\n${apiOnly ? "Existing admin (not proxied)" : "LAN admin"}: http://${host}:${adminPort}\nPress Ctrl+C to close the LAN proxy listeners.`);
  return running;
}

module.exports = { createProxyServer, closeProxyServer, parseArgs, startProxyServers, main };
if (require.main === module) main(process.argv.slice(2)).catch((error) => { console.error(`LAN proxy: ${error.message}`); process.exitCode = 1; });
