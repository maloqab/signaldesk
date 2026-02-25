export type SourceType = 'url' | 'note' | 'transcript' | 'document'
export type ClaimType = 'opportunity' | 'risk' | 'assumption' | 'unknown'
export type Confidence = 'high' | 'medium' | 'low'
export type PacketRole = 'Coder' | 'Researcher' | 'Writer' | 'Notion'
export type Horizon = '24h' | '7d' | '30d'
export type DecisionStatus = 'accepted' | 'needs-review' | 'rejected'

export type ScoreBreakdown = {
  signalQuality: number
  sourceReliability: number
  recency: number
  contradictionPenalty: number
  total: number
  rationale: string[]
}

export type SourceItem = {
  id: string
  raw: string
  type: SourceType
  valid: boolean
}

export type Claim = {
  text: string
  type: ClaimType
  confidence: Confidence
  confidenceScore: number
  scoreBreakdown: ScoreBreakdown
  sourceId: string
}

export type Decision = {
  id: string
  title: string
  rationale: string
  impact: number
  effort: number
  urgency: number
  score: number
  horizon: Horizon
  scoreBreakdown: ScoreBreakdown
  governanceReasons: string[]
  status: DecisionStatus
  conflictSourceIds: string[]
}

export type ReviewerDecision = {
  decisionId: string
  status: DecisionStatus
  notes: string
  updatedAt: string
}

export type RoadmapItem = {
  horizon: Horizon
  action: string
  owner: string
  successMetric: string
}

export type Packet = {
  role: PacketRole
  objective: string
  context: string
  tasks: string[]
  acceptanceCriteria: string[]
  dependencies: string[]
  risks: string[]
  handoffPrompt: string
  output: string
}

export type SavedSession = {
  id: string
  name: string
  createdAt: string
  intakeText: string
}

export const SESSION_KEY = 'signaldesk:sessions:v1'
export const REVIEWER_KEY = 'signaldesk:reviewers:v1'

export function intakeScopeKey(intakeText: string, sessionId?: string) {
  const normalized = intakeText.trim().toLowerCase()
  if (sessionId) return `session:${sessionId}`
  if (!normalized) return 'intake:empty'

  let hash = 5381
  for (let i = 0; i < normalized.length; i += 1) {
    hash = (hash * 33) ^ normalized.charCodeAt(i)
  }
  return `intake:${(hash >>> 0).toString(16)}`
}

const SIGNALS = {
  opportunity: ['launch', 'growth', 'demand', 'adoption', 'win', 'expand', 'retention', 'upsell', 'pipeline'],
  risk: ['risk', 'decline', 'churn', 'cost', 'delay', 'blocked', 'incident', 'burn', 'friction', 'drop'],
  assumption: ['assume', 'likely', 'should', 'expect', 'hypothesis', 'probably'],
  unknown: ['unknown', 'tbd', 'unclear', 'missing', 'need data', '?'],
  evidence: ['data', 'confirmed', 'published', 'survey', 'metric', 'evidence', 'reported'],
  weakSignal: ['maybe', 'possibly', 'guess', 'perhaps', 'rumor'],
  recency: ['today', 'this week', 'current', 'latest', '2026', 'q1', 'q2', 'q3', 'q4'],
  contradictions: ['however', 'but', 'except', 'contradict', 'conflict'],
}

export function safeUrl(raw: string) {
  try {
    new URL(raw)
    return true
  } catch {
    return false
  }
}

export function classify(raw: string): SourceType {
  const lower = raw.toLowerCase()
  if (/^https?:\/\//.test(raw)) return 'url'
  if (lower.includes('transcript') || lower.includes('speaker:') || lower.split(' ').length > 22) return 'transcript'
  if (lower.includes('.pdf') || lower.includes('doc') || lower.includes('report') || lower.includes('memo')) return 'document'
  return 'note'
}

export function parseSources(input: string): SourceItem[] {
  return input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((raw, index) => {
      const type = classify(raw)
      const valid = type === 'url' ? safeUrl(raw) : true
      return { id: `s-${index + 1}`, raw, type, valid }
    })
}

export function countMatches(raw: string, terms: string[]): number {
  const lower = raw.toLowerCase()
  return terms.reduce((sum, term) => sum + (lower.includes(term) ? 1 : 0), 0)
}

export function scoreBreakdown(raw: string, sourceType: SourceType): ScoreBreakdown {
  const evidenceHits = countMatches(raw, SIGNALS.evidence)
  const weakHits = countMatches(raw, SIGNALS.weakSignal)
  const recencyHits = countMatches(raw, SIGNALS.recency)
  const contradictionHits = countMatches(raw, SIGNALS.contradictions) + (raw.includes('?') ? 1 : 0)

  const signalQuality = Math.max(8, Math.min(45, 18 + evidenceHits * 8 - weakHits * 6 + (raw.length > 90 ? 4 : 0)))
  const sourceReliabilityBase: Record<SourceType, number> = { url: 20, document: 24, transcript: 17, note: 13 }
  const sourceReliability = sourceReliabilityBase[sourceType]
  const recency = Math.max(0, Math.min(18, recencyHits * 6 + (raw.includes('2025') || raw.includes('2026') ? 4 : 0)))
  const contradictionPenalty = Math.max(0, Math.min(24, contradictionHits * 6))

  const total = Math.max(8, Math.min(95, signalQuality + sourceReliability + recency - contradictionPenalty))
  const rationale = [
    `signal quality ${signalQuality} from evidence(${evidenceHits})/weak(${weakHits}) markers`,
    `source reliability ${sourceReliability} for ${sourceType}`,
    `recency ${recency} from recency markers(${recencyHits})`,
    `contradiction penalty -${contradictionPenalty}`,
  ]

  return { signalQuality, sourceReliability, recency, contradictionPenalty, total, rationale }
}

export function scoreConfidence(raw: string, sourceType: SourceType): number {
  return scoreBreakdown(raw, sourceType).total
}

export function bucketConfidence(score: number): Confidence {
  if (score >= 72) return 'high'
  if (score >= 46) return 'medium'
  return 'low'
}

export function extractClaimsForSource(source: SourceItem): Claim[] {
  const text = source.raw
  const claims: Claim[] = []

  const push = (type: ClaimType, phrase: string) => {
    const breakdown = scoreBreakdown(text, source.type)
    claims.push({
      type,
      text: `${phrase}: ${text.slice(0, 120)}`,
      confidence: bucketConfidence(breakdown.total),
      confidenceScore: breakdown.total,
      scoreBreakdown: breakdown,
      sourceId: source.id,
    })
  }

  const oppHits = countMatches(text, SIGNALS.opportunity)
  const riskHits = countMatches(text, SIGNALS.risk)
  const assumptionHits = countMatches(text, SIGNALS.assumption)
  const unknownHits = countMatches(text, SIGNALS.unknown)

  if (oppHits > 0 || source.type === 'url') push('opportunity', 'Opportunity signal')
  if (riskHits > 0) push('risk', 'Risk signal')
  if (assumptionHits > 0) push('assumption', 'Assumption to validate')
  if (unknownHits > 0) push('unknown', 'Unknown requiring evidence')

  if (!claims.length) {
    const fallbackType: ClaimType = source.type === 'note' ? 'assumption' : 'unknown'
    push(fallbackType, 'Context captured but under-specified')
  }

  return claims
}

export function buildClaims(sources: SourceItem[]): Claim[] {
  return sources.flatMap((source) => extractClaimsForSource(source))
}

export function averageConfidenceScore(claims: Claim[]): number {
  if (!claims.length) return 0
  return claims.reduce((sum, claim) => sum + claim.confidenceScore, 0) / claims.length
}

function computeConflictSourceIds(claims: Claim[]): string[] {
  const bySource = new Map<string, Set<ClaimType>>()
  for (const claim of claims) {
    const existing = bySource.get(claim.sourceId) ?? new Set<ClaimType>()
    existing.add(claim.type)
    bySource.set(claim.sourceId, existing)
  }

  const conflicts: string[] = []
  bySource.forEach((types, sourceId) => {
    if (types.has('opportunity') && types.has('risk')) conflicts.push(sourceId)
  })
  return conflicts
}

function decisionId(horizon: Horizon, index: number) {
  return `d-${horizon}-${index + 1}`
}

function scoreDecisionBreakdown(decision: Omit<Decision, 'score' | 'id' | 'scoreBreakdown' | 'governanceReasons' | 'status' | 'conflictSourceIds'>, claims: Claim[]) {
  const avg = averageConfidenceScore(claims)
  const contradictionPenalty = computeConflictSourceIds(claims).length * 8
  const signalQuality = Math.max(10, Math.min(40, Math.round(decision.impact * 3.2)))
  const sourceReliability = Math.max(8, Math.min(30, Math.round(avg / 3)))
  const recency = decision.horizon === '24h' ? 16 : decision.horizon === '7d' ? 10 : 6

  const total = Math.max(8, Math.min(95, signalQuality + sourceReliability + recency - contradictionPenalty))
  const rationale = [
    `signal quality ${signalQuality} from impact ${decision.impact}`,
    `source reliability ${sourceReliability} from avg claim confidence ${avg.toFixed(1)}`,
    `recency ${recency} from horizon ${decision.horizon}`,
    `contradiction penalty -${contradictionPenalty}`,
  ]

  return { signalQuality, sourceReliability, recency, contradictionPenalty, total, rationale } as ScoreBreakdown
}

function autoGovernanceStatus(score: number, conflicts: string[]): { status: DecisionStatus; reasons: string[] } {
  const reasons: string[] = []
  let status: DecisionStatus = 'accepted'

  if (score < 46) {
    status = 'needs-review'
    reasons.push('low-confidence score requires reviewer approval')
  }
  if (conflicts.length > 0) {
    status = 'needs-review'
    reasons.push(`conflicting claims detected in sources: ${conflicts.join(', ')}`)
  }

  if (!reasons.length) reasons.push('passes deterministic scoring and conflict checks')

  return { status, reasons }
}

export function buildDecisions(claims: Claim[]): Decision[] {
  const opportunities = claims.filter((c) => c.type === 'opportunity').length
  const risks = claims.filter((c) => c.type === 'risk').length
  const assumptions = claims.filter((c) => c.type === 'assumption').length
  const unknowns = claims.filter((c) => c.type === 'unknown').length

  const rows: Omit<Decision, 'score' | 'id' | 'scoreBreakdown' | 'governanceReasons' | 'status' | 'conflictSourceIds'>[] = [
    {
      title: 'Run one high-leverage experiment against the strongest upside signal',
      rationale: `Anchors on ${opportunities} opportunity signals.`,
      impact: Math.min(10, 5 + opportunities),
      effort: 4,
      urgency: 8,
      horizon: '24h',
    },
    {
      title: 'Contain downside with owner-assigned mitigation plan',
      rationale: `${risks} risk signals detected; convert each into mitigation with owner + SLA.`,
      impact: Math.min(10, 4 + risks),
      effort: 5,
      urgency: 7,
      horizon: '7d',
    },
    {
      title: 'Resolve assumptions/unknowns with targeted evidence sprint',
      rationale: `${assumptions + unknowns} uncertain claims must be validated before larger bets.`,
      impact: Math.min(10, 4 + assumptions + unknowns),
      effort: 6,
      urgency: 6,
      horizon: '30d',
    },
  ]

  const conflicts = computeConflictSourceIds(claims)

  return rows
    .map((decision, index) => {
      const breakdown = scoreDecisionBreakdown(decision, claims)
      const weightedScore = decision.impact * 1.8 + decision.urgency * 1.2 - decision.effort + breakdown.total / 50 - breakdown.contradictionPenalty / 10
      const governance = autoGovernanceStatus(breakdown.total, conflicts)
      return {
        ...decision,
        id: decisionId(decision.horizon, index),
        score: weightedScore,
        scoreBreakdown: breakdown,
        status: governance.status,
        governanceReasons: governance.reasons,
        conflictSourceIds: conflicts,
      }
    })
    .sort((a, b) => b.score - a.score)
}

export function mergeReviewerDecisions(decisions: Decision[], reviewerMap: Record<string, ReviewerDecision>) {
  return decisions.map((decision) => {
    const review = reviewerMap[decision.id]
    if (!review) return decision

    const reasons = [...decision.governanceReasons]
    reasons.push(`reviewer set status to ${review.status}`)
    if (review.notes.trim()) reasons.push(`reviewer note: ${review.notes.trim()}`)

    return {
      ...decision,
      status: review.status,
      governanceReasons: reasons,
    }
  })
}

export function hasPendingReview(decisions: Decision[]) {
  return decisions.some((decision) => decision.status === 'needs-review')
}

export function buildRoadmap(decisions: Decision[]): RoadmapItem[] {
  const fallback: RoadmapItem[] = [
    { horizon: '24h', action: 'Define decision owner + first measurable move', owner: 'Operator', successMetric: 'Owner + KPI documented' },
    { horizon: '7d', action: 'Run execution sprint and mitigate top risk', owner: 'Cross-functional', successMetric: 'Risk register reduced by 30%' },
    {
      horizon: '30d',
      action: 'Institutionalize learnings into repeatable workflow',
      owner: 'Leadership',
      successMetric: 'Strategy cycle time drops week-over-week',
    },
  ]

  const map = new Map<Horizon, Decision>()
  decisions.forEach((decision) => map.set(decision.horizon, decision))

  return (['24h', '7d', '30d'] as const).map((horizon, index) => {
    const decision = map.get(horizon)
    if (!decision) return fallback[index]

    return {
      horizon,
      action: decision.title,
      owner: horizon === '24h' ? 'Operator + Coder' : horizon === '7d' ? 'Ops Lead' : 'Strategy Lead',
      successMetric:
        horizon === '24h'
          ? 'First experiment launched with baseline metric'
          : horizon === '7d'
            ? 'Mitigation and opportunity progress reviewed with evidence'
            : 'Validated playbook + next-quarter plan approved',
    }
  })
}

export function buildPackets(decisions: Decision[], claims: Claim[]): Packet[] {
  const top = decisions[0]
  const riskLines = claims.filter((claim) => claim.type === 'risk').slice(0, 3).map((claim) => claim.text)
  const unknownLines = claims.filter((claim) => claim.type === 'unknown').slice(0, 3).map((claim) => claim.text)
  const opportunityLines = claims.filter((claim) => claim.type === 'opportunity').slice(0, 3).map((claim) => claim.text)

  return [
    {
      role: 'Coder',
      objective: top ? top.title : 'Build the highest-impact execution slice.',
      context: `Top decision score: ${top?.score.toFixed(1) ?? 'n/a'} (${top?.status ?? 'n/a'}).`,
      tasks: [
        'Translate decision into an implementation plan with milestones (today/this week/this month).',
        'Implement the minimum production-usable slice with instrumentation hooks.',
        'Document rollback path, risks, and measurable success conditions.',
      ],
      acceptanceCriteria: [
        'A runnable implementation exists with clear setup instructions.',
        'At least one metric is tracked against decision success.',
        'PR includes changelog and risk notes.',
      ],
      dependencies: ['Access to codebase + deployment target', 'Metric sink (analytics/logging)'],
      risks: riskLines.length ? riskLines : ['Scope expansion without measurable milestone'],
      handoffPrompt:
        'You are the implementation owner. Execute the tasks in order, keep scope tight, and return a PR summary with KPI deltas.',
      output: 'PR + release notes + KPI dashboard hook.',
    },
    {
      role: 'Researcher',
      objective: 'Resolve unknowns and de-risk assumptions with evidence.',
      context: `${unknownLines.length} unknown signals and ${riskLines.length} risk signals currently active.`,
      tasks: [
        'Prioritize unknown queue by decision impact.',
        'Collect 5 corroborating/disproving data points per top unknown.',
        'Publish confidence delta memo with keep/kill/iterate recommendation.',
      ],
      acceptanceCriteria: [
        'Each top unknown has at least one primary source and one secondary source.',
        'Confidence updates are quantified and tied to evidence links.',
        'Recommendation includes explicit next decision owner.',
      ],
      dependencies: ['Source access (links/docs/transcripts)', 'Timebox for evidence sprint'],
      risks: ['Confirmation bias from single-source evidence', ...riskLines.slice(0, 2)],
      handoffPrompt:
        'You are the research lead. Produce an evidence-backed memo, update confidence per claim, and flag any decision that should be paused.',
      output: 'Evidence memo + confidence update matrix.',
    },
    {
      role: 'Writer',
      objective: 'Translate strategy into operator-ready narratives.',
      context: `${opportunityLines.length} opportunities and ${riskLines.length} risks must be represented clearly.`,
      tasks: [
        'Draft narrative flow: signal summary → ranked decisions → roadmap.',
        'Prepare two versions: 90-second standup and stakeholder digest.',
        'Include explicit ask/decision points and next check-in date.',
      ],
      acceptanceCriteria: [
        'Narrative contains decision rationale, not just summary text.',
        'Each roadmap horizon has one owner and one success metric.',
        'Language is concise and non-ambiguous for handoff.',
      ],
      dependencies: ['Latest decision ranking', 'Roadmap + risk watchlist'],
      risks: ['Overly generic language that hides tradeoffs'],
      handoffPrompt:
        'You are the strategy writer. Deliver concise, decision-first updates that operators can execute without clarification loops.',
      output: 'Briefing copy (standup + stakeholder variants).',
    },
    {
      role: 'Notion',
      objective: 'Materialize roadmap into an execution database.',
      context: 'Operationalize all decisions with traceability back to source claims.',
      tasks: [
        'Create database schema with impact, effort, urgency, confidence, horizon, owner.',
        'Generate filtered views for 24h/7d/30d planning cadences.',
        'Attach each row to evidence links and packet owner role.',
      ],
      acceptanceCriteria: [
        'Every decision appears as a trackable row with owner and due window.',
        'Views exist for daily execution and weekly review.',
        'Fields support confidence changes over time.',
      ],
      dependencies: ['Notion workspace + template import permission', 'Final roadmap items'],
      risks: ['Schema drift if fields are renamed without migration notes'],
      handoffPrompt:
        'You are the operations system owner. Build a clean Notion execution layer that mirrors roadmap horizons and supports status reporting.',
      output: 'Import-ready Notion schema + seeded execution board.',
    },
  ]
}

export function toMarkdown(
  title: string,
  sources: SourceItem[],
  claims: Claim[],
  decisions: Decision[],
  roadmap: RoadmapItem[],
  packets: Packet[],
  reviewerTrail: ReviewerDecision[],
): string {
  const lines: string[] = [
    `# ${title}`,
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    '## Intake Sources',
    ...sources.map((source) => `- [${source.type.toUpperCase()}] ${source.raw}`),
    '',
    '## Intelligence Brief',
    ...claims.map(
      (claim) =>
        `- (${claim.confidence}/${claim.confidenceScore}) ${claim.type.toUpperCase()}: ${claim.text} | why: ${claim.scoreBreakdown.rationale.join('; ')}`,
    ),
    '',
    '## Ranked Decisions',
    ...decisions.map(
      (decision) =>
        `- ${decision.title} | status:${decision.status} | score:${decision.score.toFixed(1)} impact:${decision.impact} effort:${decision.effort} urgency:${decision.urgency} | why: ${decision.scoreBreakdown.rationale.join('; ')} | governance: ${decision.governanceReasons.join(' | ')}`,
    ),
    '',
    '## Reviewer Trail',
    ...(reviewerTrail.length
      ? reviewerTrail.map((item) => `- ${item.decisionId} → ${item.status} @ ${item.updatedAt}${item.notes ? ` | notes: ${item.notes}` : ''}`)
      : ['- No reviewer actions recorded.']),
    '',
    '## 24h / 7d / 30d Roadmap',
    ...roadmap.map((item) => `- [${item.horizon}] ${item.action} | owner:${item.owner} | success:${item.successMetric}`),
    '',
    '## Execution Packets',
  ]

  packets.forEach((packet) => {
    lines.push(`### ${packet.role}`)
    lines.push(`- Objective: ${packet.objective}`)
    lines.push(`- Context: ${packet.context}`)
    lines.push('- Tasks:')
    packet.tasks.forEach((task) => lines.push(`  - ${task}`))
    lines.push('- Acceptance criteria:')
    packet.acceptanceCriteria.forEach((item) => lines.push(`  - ${item}`))
    lines.push('- Dependencies:')
    packet.dependencies.forEach((item) => lines.push(`  - ${item}`))
    lines.push('- Risks:')
    packet.risks.forEach((item) => lines.push(`  - ${item}`))
    lines.push(`- Handoff prompt: ${packet.handoffPrompt}`)
    lines.push(`- Output: ${packet.output}`)
    lines.push('')
  })

  return lines.join('\n')
}

export function packetToMarkdown(packet: Packet): string {
  const lines = [
    `# SignalDesk Task Packet — ${packet.role}`,
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    '## Objective',
    packet.objective,
    '',
    '## Context',
    packet.context,
    '',
    '## Tasks',
    ...packet.tasks.map((task) => `- ${task}`),
    '',
    '## Acceptance Criteria',
    ...packet.acceptanceCriteria.map((item) => `- ${item}`),
    '',
    '## Dependencies',
    ...packet.dependencies.map((item) => `- ${item}`),
    '',
    '## Risks',
    ...packet.risks.map((item) => `- ${item}`),
    '',
    '## Handoff Prompt',
    packet.handoffPrompt,
    '',
    '## Expected Output',
    packet.output,
    '',
  ]

  return lines.join('\n')
}

export function loadSessions(storage: Storage = localStorage): SavedSession[] {
  try {
    const raw = storage.getItem(SESSION_KEY)
    if (!raw) return []
    return JSON.parse(raw) as SavedSession[]
  } catch {
    return []
  }
}

export function saveSessionToStorage(session: SavedSession, existing: SavedSession[], storage: Storage = localStorage): SavedSession[] {
  const merged = [session, ...existing].slice(0, 20)
  storage.setItem(SESSION_KEY, JSON.stringify(merged))
  return merged
}

type ReviewerStore = Record<string, Record<string, ReviewerDecision>>

function loadReviewerStore(storage: Storage = sessionStorage): ReviewerStore {
  try {
    const raw = storage.getItem(REVIEWER_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as ReviewerStore
  } catch {
    return {}
  }
}

export function loadReviewerDecisions(scopeKey: string, storage: Storage = sessionStorage): Record<string, ReviewerDecision> {
  const store = loadReviewerStore(storage)
  return store[scopeKey] ?? {}
}

export function saveReviewerDecision(
  entry: ReviewerDecision,
  current: Record<string, ReviewerDecision>,
  scopeKey: string,
  storage: Storage = sessionStorage,
) {
  const nextScope = { ...current, [entry.decisionId]: entry }
  const store = loadReviewerStore(storage)
  const nextStore: ReviewerStore = { ...store, [scopeKey]: nextScope }
  storage.setItem(REVIEWER_KEY, JSON.stringify(nextStore))
  return nextScope
}

export function reviewerTrail(reviewerMap: Record<string, ReviewerDecision>) {
  return Object.values(reviewerMap).sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))
}
