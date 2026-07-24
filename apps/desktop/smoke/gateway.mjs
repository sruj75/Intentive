// Controlled test gateway for the signed-in Capture Session smoke (#35).
//
// Does the *real* Protocol handshake: it parses the Desktop's first frame as a
// `connect` with the real `@intentive/protocol` parser and replies `hello_ok`
// with an empty Session Snapshot. Every later inbound frame is parsed with the
// same real client→runtime parser; `context_snapshot` / `session_end_marker`
// frames are appended to a JSONL receipts file keyed by `snapshot_id` /
// `ended_at`. Any frame the real schema rejects is recorded as a loud FAIL — the
// gateway is the live contract check the ack-less sender (ADR-0005) never gets.

import { appendFileSync, writeFileSync } from "node:fs";

import { parseClientToRuntimeEvent } from "@intentive/protocol";
import { WebSocketServer } from "ws";

/**
 * Start the recording gateway on an ephemeral port.
 *
 * @param {{ receiptsPath: string }} opts
 * @returns {Promise<{ url: string, port: number, receiptsPath: string, close: () => Promise<void> }>}
 */
export async function startGateway({ receiptsPath }) {
  // Truncate any receipts from a previous run so `assert.mjs` only sees this one.
  writeFileSync(receiptsPath, "");

  const wss = new WebSocketServer({ port: 0, path: "/ws" });
  await new Promise((resolve) => wss.once("listening", resolve));
  const { port } = wss.address();
  const url = `ws://127.0.0.1:${port}/ws`;

  const record = (receipt) => {
    appendFileSync(receiptsPath, `${JSON.stringify(receipt)}\n`);
  };

  wss.on("connection", (socket) => {
    let handshakeDone = false;
    console.log("🔌 gateway: client connected");

    socket.on("message", (data) => {
      const received_at = new Date().toISOString();
      const raw = data.toString();
      let parsed;
      try {
        parsed = parseClientToRuntimeEvent(JSON.parse(raw));
      } catch (err) {
        // A frame the real schema rejects is a contract failure, full stop.
        console.error(`❌ gateway: REJECTED frame: ${err?.message ?? err}`);
        record({
          type: "REJECTED",
          ok: false,
          error: String(err?.message ?? err),
          raw,
          received_at,
        });
        return;
      }

      if (!handshakeDone) {
        if (parsed.type !== "connect") {
          console.error(`❌ gateway: first frame was '${parsed.type}', expected 'connect'`);
          record({
            type: "REJECTED",
            ok: false,
            error: `first frame ${parsed.type} != connect`,
            received_at,
          });
          return;
        }
        handshakeDone = true;
        console.log(`🤝 gateway: connect accepted (client_kind=${parsed.client_kind})`);
        socket.send(
          JSON.stringify({
            type: "hello_ok",
            session_snapshot: { messages: [], before_cursor: null },
          }),
        );
        return;
      }

      if (parsed.type === "context_snapshot") {
        console.log(`📥 gateway: context_snapshot ${parsed.snapshot_id}`);
        record({
          type: parsed.type,
          ok: true,
          snapshot_id: parsed.snapshot_id,
          captured_at: parsed.captured_at,
          received_at,
        });
        return;
      }
      if (parsed.type === "session_end_marker") {
        console.log(`📥 gateway: session_end_marker (${parsed.reason})`);
        record({
          type: parsed.type,
          ok: true,
          ended_at: parsed.ended_at,
          reason: parsed.reason,
          received_at,
        });
        return;
      }

      // Schema-valid but not an event Desktop should ever send (Desktop is
      // capture-only — no user_message/presence/etc). Record it so assert flags it.
      console.error(`⚠️  gateway: unexpected client frame '${parsed.type}'`);
      record({ type: parsed.type, ok: false, error: "unexpected client frame", received_at });
    });

    socket.on("close", () => console.log("🔌 gateway: client disconnected"));
  });

  return {
    url,
    port,
    receiptsPath,
    close: () =>
      new Promise((resolve) => {
        for (const client of wss.clients) client.terminate();
        wss.close(() => resolve());
      }),
  };
}
