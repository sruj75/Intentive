# @intentive/boundary

The one leak-free parse-at-boundary decode for every inbound boundary (WebSocket + HTTP). See [`../CONTEXT.md`](../CONTEXT.md), [monorepo ADR-0004](../../docs/adr/0004-shared-boundary-decode-package.md), and [`ARCHITECTURE.md`](ARCHITECTURE.md).

**Rule:** inbound payloads decode through `parseBoundary` at the runtime boundary (the WebSocket message handler or HTTP request handler) and never pass raw into `service`/`repo` layers. On failure, `BoundaryParseError` surfaces only offending key paths — never values.
