# Architecture Snapshot

`architecture.json` is the machine-readable source of truth for the current
repository architecture. `architecture.html` is generated from that JSON and
is a self-contained Human view: open it directly in any modern browser.

Regenerate both artifacts from the checked-out commit:

```bash
npm run architecture:snapshot
```

The generator records the exact `git rev-parse HEAD` value and current time.
For the same commit, content is structurally equivalent except for
`generatedFrom.generatedAt`.

V1 intentionally has no watcher or scheduled refresh. Check the
`staleIndicators` in `architecture.json` before relying on an older Snapshot.
Unknowns and assumptions are retained explicitly; they must not be upgraded to
confirmed facts without repository evidence.

AUTO-REFRESH-V1 is **designed**; a **manual** pilot exists
(`npm run auto-refresh:pilot`). Persistent AUTO-REFRESH has a **DISABLED-MODE**
workflow (`workflow_dispatch` only) and remains **NOT ENABLED** (no push-to-main
automation) — see [`persistent-auto-refresh-v1.md`](./persistent-auto-refresh-v1.md).
