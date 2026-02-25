# SignalDesk

SignalDesk is an AI-operator style console for turning messy context (links, notes, docs, transcript fragments) into:
- structured intelligence briefs
- ranked decisions
- 24h / 7d / 30d action roadmaps
- execution-ready task packets by role

Built local-first with no backend requirement.

## Who it serves

- Solo founders and operators handling fragmented context
- Analysts turning raw inputs into decision memos
- AI-native teams that need execution packets, not generic summaries

## What we built

### 1) Intake Layer
- Bulk text intake (one source per line)
- Source classification (`url`, `note`, `transcript`, `document`)
- URL validity checks + invalid-source highlighting
- Local session save/reload (`localStorage`)

### 2) Intel Engine
- Per-source multi-claim extraction across:
  - opportunities
  - risks
  - assumptions
  - unknowns
- Deterministic confidence scoring per claim with explainability components:
  - signal quality
  - source reliability
  - recency
  - contradiction penalty
- Visible “why this score” rationale in UI and exports

### 3) Decision Governance Layer (Gate 2)
- Decision status model:
  - `accepted`
  - `needs-review`
  - `rejected`
- Auto-governance rules:
  - low-confidence decisions (`<46`) become `needs-review`
  - conflicting claims (opportunity + risk from same source) become `needs-review`
- Final export gating:
  - Markdown/JSON final exports are blocked while any decision remains `needs-review`
- Reviewer workflow:
  - per-decision disposition controls
  - reviewer notes
  - persisted reviewer actions in `sessionStorage`
  - reviewer trail included in JSON + Markdown exports

### 4) Decision + Roadmap Layer
- Weighted ranking using impact, urgency, effort, and deterministic confidence factors
- Decision rationale generated for each ranked item
- 24h / 7d / 30d roadmap with owner + success metric

### 5) Execution Packets
Role-specific packets for:
- Coder
- Researcher
- Writer
- Notion

Each packet includes:
- objective
- context
- tasks
- acceptance criteria
- dependencies
- risks
- handoff prompt
- expected output

Exports:
- full intelligence pack (`.md`, `.json`)
- per-role packet markdown export

## Architecture

Single-page React app with deterministic local inference.

- `src/App.tsx`
  - intake UI + validation
  - deterministic score explainability rendering
  - governance + reviewer controls
  - export gating and artifacts
- `src/lib/signaldesk.ts`
  - source parsing + classification
  - claim scoring and breakdowns
  - decision scoring + governance rules
  - reviewer persistence helpers
  - markdown/json export shaping
- `src/components/ErrorBoundary.tsx`
  - render safety fallback

Processing pipeline:
1. Intake text -> parsed sources
2. Sources -> claims + deterministic score breakdowns
3. Claims -> ranked decisions + governance statuses
4. Reviewer actions -> status overrides + notes trail
5. Decisions -> roadmap + packets
6. Exports -> gated markdown/json artifacts with reviewer trail

## Data model (core types)

- `SourceItem`: id, raw, type, valid
- `Claim`: type, text, confidence, confidenceScore, scoreBreakdown, sourceId
- `Decision`: id, title, rationale, impact, effort, urgency, score, horizon, scoreBreakdown, status, governanceReasons, conflictSourceIds
- `ReviewerDecision`: decisionId, status, notes, updatedAt
- `RoadmapItem`: horizon, action, owner, successMetric
- `Packet`: role, objective, context, tasks, acceptanceCriteria, dependencies, risks, handoffPrompt, output
- `SavedSession`: id, name, createdAt, intakeText

## Gate 2 workflow

1. Paste sources in Intake Layer
2. Review claim-level explainability and decision-level “why this score”
3. In Decision Governance panel, resolve items in `needs-review` using disposition + notes
4. Confirm no pending reviews remain
5. Export final Markdown/JSON (reviewer trail included)

Rule reference: see `DECISION_RULES.md`.

## Run locally

```bash
npm install
npm run dev
```

## Test and build

```bash
npx vitest run --coverage
npm run build
```

## Scope boundaries (current)

- No backend, auth, or server persistence
- No external LLM calls in current version (deterministic local heuristics)
- Notion support is packet/schema-ready export format, not direct API sync yet

## Why this is helpful

SignalDesk bridges a gap between summary tools and execution systems: it converts noisy context into operator-grade outputs with explicit decisions, owners, timelines, governance checks, and handoff artifacts.
