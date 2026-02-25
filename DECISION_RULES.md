# SignalDesk Decision Rules (Gate 2)

## 1) Deterministic score breakdown

Each claim and decision has a deterministic score breakdown with four components:

- `signalQuality`
  - Evidence markers increase score
  - Weak-signal language decreases score
  - Longer context can add small boost
- `sourceReliability`
  - Fixed base by source type:
    - `document`: 24
    - `url`: 20
    - `transcript`: 17
    - `note`: 13
- `recency`
  - Recency markers (e.g. `today`, `this week`, quarter refs) add points
- `contradictionPenalty`
  - Contradiction markers and unresolved-question markers apply penalty

Formula:

`total = clamp(8..95, signalQuality + sourceReliability + recency - contradictionPenalty)`

## 2) Governance statuses

Decision statuses:

- `accepted`
- `needs-review`
- `rejected`

Auto-governance rules:

1. Low confidence rule:
   - If decision breakdown total `< 46`, set status to `needs-review`
2. Conflict rule:
   - If conflicting claim types (`opportunity` and `risk`) exist for the same source, set status to `needs-review`

If no rules trigger, decision defaults to `accepted`.

## 3) Export gating

Final export (`Markdown` / `JSON`) is blocked when *any* decision remains `needs-review`.

UI behavior:

- Export buttons disabled while blockers exist
- Inline alert explains why export is blocked

## 4) Reviewer workflow rules

Reviewer can set decision disposition (`accepted | needs-review | rejected`) and attach notes.

- Actions are persisted to browser `sessionStorage`
- Reviewer actions override auto status for final disposition
- Reviewer notes and disposition are appended to governance rationale trail
- Reviewer trail is included in both JSON and Markdown exports
