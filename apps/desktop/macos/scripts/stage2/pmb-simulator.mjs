#!/usr/bin/env node
// Local, throwaway WebSocket server used only by full-stack-signed-in-driver.sh
// to prove the Desktop client correctly receives and acknowledges a
// `companion_message` (proactive Post-Message-Back) event over the wire, per
// packages/protocol's schema (packages/protocol/src/index.ts). This never
// runs against and never touches services/agent-runtime or
// services/control-plane — it stands in for the real runtime for one
// connection, then exits.
//
// The Desktop app is pointed at this server via INTENTIVE_CONTROL_PLANE_URL
// (see apps/desktop/macos/Desktop/Sources/Intentive/MainWindowView.swift),
// whose fake `GET /agent` response hands back this server's ws:// address.
//
// Verification: the app acknowledges any companion_message unconditionally,
// with no user interaction, the instant it's received (see
// DesktopExperience.swift:137-140 `handle(_ message: CompanionMessage)` ->
// `runtimeClient.acknowledge(messageId:)`). So a real `delivery_ack` with the
// matching message_id proves the receive/render/ack path works end to end.
//
// Usage:
//   pmb-simulator.mjs --port 0 --message-id ID --body TEXT \
//     --ack-timeout-ms 15000 --output JSON
//
// --port 0 picks a random free port; the chosen port and ws:// URL are
// printed to stdout as the first line (JSON: {"ws_url": "..."}) so the
// caller can build the fake control-plane response before the app connects.

import { createServer } from "node:http";
import { createHash, randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import {
  parseRuntimeToClientEvent,
  safeParseClientToRuntimeEvent,
} from "../../../../../packages/protocol/dist/index.js";
import {
  GetAgentResponse,
  GetMeResponse,
  PostDeviceRegisterResponse,
  parseBoundary as parseAPIContract,
} from "../../../../../packages/api-contract/dist/index.js";

const WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

function parseArgs(argv) {
  const args = { port: 0, bind: "127.0.0.1", ackTimeoutMs: 15000 };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (flag === "--port") args.port = Number(value);
    else if (flag === "--bind") args.bind = value;
    else if (flag === "--advertise-host") args.advertiseHost = value;
    else if (flag === "--message-id") args.messageId = value;
    else if (flag === "--user-id") args.userId = value;
    else if (flag === "--body") args.body = value;
    else if (flag === "--ack-timeout-ms") args.ackTimeoutMs = Number(value);
    else if (flag === "--output") args.output = value;
    else continue;
    i += 1;
  }
  args.messageId ??= `pmb-sim-${randomUUID()}`;
  args.userId ??= "00000000-0000-4000-8000-000000000001";
  args.body ??= "Simulated proactive check-in for release verification.";
  return args;
}

function acceptKeyFor(clientKey) {
  return createHash("sha1")
    .update(clientKey + WS_GUID)
    .digest("base64");
}

function encodeTextFrame(text) {
  const payload = Buffer.from(text, "utf8");
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.from([0x81, len]);
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    throw new Error("pmb-simulator: payload too large for this minimal encoder");
  }
  return Buffer.concat([header, payload]);
}

// Incremental decoder for masked client->server text frames. Assumes each
// message arrives unfragmented (FIN=1), which is true for the small JSON
// messages this protocol exchanges.
function tryDecodeFrame(buffer) {
  if (buffer.length < 2) return null;
  const byte1 = buffer[1];
  const masked = (byte1 & 0x80) !== 0;
  let len = byte1 & 0x7f;
  let offset = 2;
  if (len === 126) {
    if (buffer.length < offset + 2) return null;
    len = buffer.readUInt16BE(offset);
    offset += 2;
  } else if (len === 127) {
    if (buffer.length < offset + 8) return null;
    len = Number(buffer.readBigUInt64BE(offset));
    offset += 8;
  }
  let maskKey;
  if (masked) {
    if (buffer.length < offset + 4) return null;
    maskKey = buffer.subarray(offset, offset + 4);
    offset += 4;
  }
  if (buffer.length < offset + len) return null;
  const payload = buffer.subarray(offset, offset + len);
  if (masked) {
    for (let i = 0; i < payload.length; i += 1) payload[i] ^= maskKey[i % 4];
  }
  return { text: payload.toString("utf8"), rest: buffer.subarray(offset + len) };
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const result = {
    ok: false,
    message_id: args.messageId,
    acked: false,
    received_messages: [],
    elapsed_ms: null,
  };

  let announcedWSURL = "";
  const server = createServer((req, res) => {
    const json = (status, value) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(value));
    };
    if (req.url?.startsWith("/me")) {
      json(
        200,
        parseAPIContract(GetMeResponse, {
          user_id: args.userId,
          email: "desktop-stage2@heyintentive.com",
          next_gate: null,
          has_agent_instance: true,
          has_desktop_client: true,
        }),
      );
    } else if (req.url === "/devices/register" && req.method === "POST") {
      json(
        200,
        parseAPIContract(PostDeviceRegisterResponse, {
          device_id: "00000000-0000-4000-8000-000000000002",
        }),
      );
    } else if (req.url?.startsWith("/agent")) {
      json(
        200,
        parseAPIContract(GetAgentResponse, {
          agent_instance_id: "00000000-0000-4000-8000-000000000003",
          ws_url: announcedWSURL,
          runtime_jwt: "stage2-runtime-jwt",
        }),
      );
    } else {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found");
    }
  });

  let settle;
  const done = new Promise((resolve) => {
    settle = resolve;
  });

  server.on("upgrade", (req, socket) => {
    const key = req.headers["sec-websocket-key"];
    if (!key) {
      socket.destroy();
      return;
    }
    socket.write(
      "HTTP/1.1 101 Switching Protocols\r\n" +
        "Upgrade: websocket\r\n" +
        "Connection: Upgrade\r\n" +
        `Sec-WebSocket-Accept: ${acceptKeyFor(key)}\r\n\r\n`,
    );

    const startedAt = Date.now();
    let inbox = Buffer.alloc(0);
    let sentCompanionMessage = false;
    let ackTimer = null;

    socket.on("data", (chunk) => {
      inbox = Buffer.concat([inbox, chunk]);
      let frame;
      while ((frame = tryDecodeFrame(inbox))) {
        inbox = frame.rest;
        let rawMessage;
        try {
          rawMessage = JSON.parse(frame.text);
        } catch {
          continue;
        }
        const parsed = safeParseClientToRuntimeEvent(rawMessage);
        if (!parsed.success) continue;
        const message = parsed.data;
        result.received_messages.push(message);

        if (message.type === "connect") {
          const hello = parseRuntimeToClientEvent({
            type: "hello_ok",
            session_snapshot: { messages: [], before_cursor: null },
          });
          socket.write(encodeTextFrame(JSON.stringify(hello)));
          if (!sentCompanionMessage) {
            sentCompanionMessage = true;
            const companionMessage = parseRuntimeToClientEvent({
              type: "companion_message",
              message_id: args.messageId,
              body: args.body,
              emitted_at: new Date().toISOString(),
              via_post_message_back: true,
            });
            socket.write(encodeTextFrame(JSON.stringify(companionMessage)));
            ackTimer = setTimeout(() => {
              result.elapsed_ms = Date.now() - startedAt;
              socket.destroy();
              server.close();
              settle();
            }, args.ackTimeoutMs);
          }
        } else if (message.type === "delivery_ack" && message.message_id === args.messageId) {
          result.acked = true;
          result.ok = true;
          result.elapsed_ms = Date.now() - startedAt;
          clearTimeout(ackTimer);
          socket.destroy();
          server.close();
          settle();
        }
      }
    });

    socket.on("error", () => {});
  });

  const noConnectionTimer = setTimeout(() => {
    server.close();
    settle();
  }, args.ackTimeoutMs);
  await new Promise((resolve) => server.listen(args.port, args.bind, resolve));
  const { port } = server.address();
  const advertisedHost = args.advertiseHost ?? (args.bind === "0.0.0.0" ? "127.0.0.1" : args.bind);
  announcedWSURL = `ws://${advertisedHost}:${port}`;
  console.log(
    JSON.stringify({
      ws_url: announcedWSURL,
      control_plane_url: `http://${advertisedHost}:${port}`,
    }),
  );

  await done;
  clearTimeout(noConnectionTimer);

  if (args.output) {
    writeFileSync(args.output, JSON.stringify(result, null, 2) + "\n");
  } else {
    console.log(JSON.stringify(result, null, 2));
  }
  process.exit(result.ok ? 0 : 1);
}

run();
