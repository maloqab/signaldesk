import { useMemo, useState } from 'react'
import './App.css'

type SourceType = 'url' | 'note' | 'transcript' | 'document'
type ClaimType = 'opportunity' | 'risk' | 'assumption' | 'unknown'
type Confidence = 'high' | 'medium' | 'low'
type PacketRole = 'Coder' | 'Researcher' | 'Writer' | 'Notion'
type Horizon = '24h' | '7d' | '30d'

type SourceItem = {
  id: string
  raw: string
  type: SourceType
  valid: boolean
}

type Claim = {
  text: string
  type: ClaimType
  confidence: Confidence
  confidenceScore: number
  sourceId: string
}

type Decision = {
  title: string
  rationale: string
  impact: number
  effort: number
  urgency: number
  score: number
  horizon: Horizon
}

type RoadmapItem = {
  horizon: Horizon
  action: string
  owner: string
  successMetric: string
}

type Packet = {
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

type SavedSession = {
  id: string
  name: string
  createdAt: string
  intakeText: string
}

const SESSION_KEY = 'signaldesk:sessions:v1'

const SIGNALS = {
  opportunity: ['launch', 'growth', 'demand', 'adoption', 'win', 'expand', 'retention', 'upsell', 'pipeline'],
  risk: ['risk', 'decline', 'churn', 'cost', 'delay', 'blocked', 'incident', 'burn', 'friction', 'drop'],
  assumption: ['assume', 'likely', 'should', 'expect', 'hypothesis', 'probably'],
  unknown: ['unknown', 'tbd', 'unclear', 'missing', 'need data', '?'],
  evidence: ['data', 'confirmed', 'published', 'survey', 'metric', 'evidence', 'reported'],
  weakSignal: ['maybe', 'possibly', 'guess', 'perhaps', 'rumor'],
}

function safeUrl(raw: string) {
  try {
    new URL(raw)
    return true
  } catch {
    return false
  }
}

function classify(raw: string): SourceType {
  const lower = raw.toLowerCase()
  if (/^https?:\/\//.test(raw)) return 'url'
  if (lower.includes('transcript') || lower.includes('speaker:') || lower.split(' ').length > 22) return 'transcript'
  if (lower.includes('.pdf') || lower.includes('doc') || lower.includes('report') || lower.includes('memo')) return 'document'
  return 'note'
}

function parseSources(input: string): SourceItem[] {
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

function countMatches(raw: string, terms: string[]): number {
  const lower = raw.toLowerCase()
  return terms.reduce((sum, term) => sum + (lower.includes(term) ? 1 : 0), 0)
}

function scoreConfidence(raw: string, sourceType: SourceType): number {
  let score = 44

  if (sourceType === 'url') score += 8
  if (sourceType === 'document') score += 10
  if (sourceType === 'transcript') score += 4

  score += countMatches(raw, SIGNALS.evidence) * 14
  score -= countMatches(raw, SIGNALS.weakSignal) * 12

  if (raw.length > 90) score += 6
  if (raw.includes('?')) score -= 6

  return Math.max(8, Math.min(95, score))
}

function bucketConfidence(score: number): Confidence {
  if (score >= 72) return 'high'
  if (score >= 46) return 'medium'
  return 'low'
}

function extractClaimsForSource(source: SourceItem): Claim[] {
  const text = source.raw
  const claims: Claim[] = []

  const push = (type: ClaimType, phrase: string) => {
    const confidenceScore = scoreConfidence(text, source.type)
    claims.push({
      type,
      text: `${phrase}: ${text.slice(0, 120)}`,
      confidence: bucketConfidence(confidenceScore),
      confidenceScore,
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

function buildClaims(sources: SourceItem[]): Claim[] {
  return sources.flatMap((source) => extractClaimsForSource(source))
}

function averageConfidenceScore(claims: Claim[]): number {
  if (!claims.length) return 0
  return claims.reduce((sum, claim) => sum + claim.confidenceScore, 0) / claims.length
}

function buildDecisions(claims: Claim[]): Decision[] {
  const opportunities = claims.filter((c) => c.type === 'opportunity').length
  const risks = claims.filter((c) => c.type === 'risk').length
  const assumptions = claims.filter((c) => c.type === 'assumption').length
  const unknowns = claims.filter((c) => c.type === 'unknown').length
  const confidenceMean = averageConfidenceScore(claims)

  const confidenceBoost = confidenceMean >= 65 ? 1.2 : 0
  const confidenceDrag = confidenceMean < 50 ? 1.0 : 0

  const rows: Omit<Decision, 'score'>[] = [
    {
      title: 'Run one high-leverage experiment against the strongest upside signal',
      rationale: `Anchors on ${opportunities} opportunity signals while confidence avg is ${confidenceMean.toFixed(0)}.`,
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

  return rows
    .map((d) => ({ ...d, score: d.impact * 1.8 + d.urgency * 1.2 - d.effort + confidenceBoost - confidenceDrag }))
    .sort((a, b) => b.score - a.score)
}

function buildRoadmap(decisions: Decision[]): RoadmapItem[] {
  const fallback: RoadmapItem[] = [
    { horizon: '24h', action: 'Define decision owner + first measurable move', owner: 'Operator', successMetric: 'Owner + KPI documented' },
    { horizon: '7d', action: 'Run execution sprint and mitigate top risk', owner: 'Cross-functional', successMetric: 'Risk register reduced by 30%' },
    { horizon: '30d', action: 'Institutionalize learnings into repeatable workflow', owner: 'Leadership', successMetric: 'Strategy cycle time drops week-over-week' },
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

function buildPackets(decisions: Decision[], claims: Claim[]): Packet[] {
  const top = decisions[0]
  const riskLines = claims.filter((claim) => claim.type === 'risk').slice(0, 3).map((claim) => claim.text)
  const unknownLines = claims.filter((claim) => claim.type === 'unknown').slice(0, 3).map((claim) => claim.text)
  const opportunityLines = claims.filter((claim) => claim.type === 'opportunity').slice(0, 3).map((claim) => claim.text)

  return [
    {
      role: 'Coder',
      objective: top ? top.title : 'Build the highest-impact execution slice.',
      context: `Top decision score: ${top?.score.toFixed(1) ?? 'n/a'}.`,
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

function toMarkdown(
  title: string,
  sources: SourceItem[],
  claims: Claim[],
  decisions: Decision[],
  roadmap: RoadmapItem[],
  packets: Packet[],
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
    ...claims.map((claim) => `- (${claim.confidence}/${claim.confidenceScore}) ${claim.type.toUpperCase()}: ${claim.text}`),
    '',
    '## Ranked Decisions',
    ...decisions.map(
      (decision) =>
        `- ${decision.title} | score:${decision.score.toFixed(1)} impact:${decision.impact} effort:${decision.effort} urgency:${decision.urgency} | ${decision.rationale}`,
    ),
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

function packetToMarkdown(packet: Packet): string {
  const lines = [
    `# SignalDesk Task Packet — ${packet.role}`,
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    `## Objective`,
    packet.objective,
    '',
    `## Context`,
    packet.context,
    '',
    `## Tasks`,
    ...packet.tasks.map((task) => `- ${task}`),
    '',
    `## Acceptance Criteria`,
    ...packet.acceptanceCriteria.map((item) => `- ${item}`),
    '',
    `## Dependencies`,
    ...packet.dependencies.map((item) => `- ${item}`),
    '',
    `## Risks`,
    ...packet.risks.map((item) => `- ${item}`),
    '',
    `## Handoff Prompt`,
    packet.handoffPrompt,
    '',
    `## Expected Output`,
    packet.output,
    '',
  ]

  return lines.join('\n')
}

function downloadFile(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}

function loadSessions(): SavedSession[] {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return []
    return JSON.parse(raw) as SavedSession[]
  } catch {
    return []
  }
}

function App() {
  const [intakeText, setIntakeText] = useState('')
  const [sessionName, setSessionName] = useState('')
  const [sessions, setSessions] = useState<SavedSession[]>(() => loadSessions())
  const [activeSession, setActiveSession] = useState('')

  const sources = useMemo(() => parseSources(intakeText), [intakeText])
  const claims = useMemo(() => buildClaims(sources), [sources])
  const decisions = useMemo(() => buildDecisions(claims), [claims])
  const roadmap = useMemo(() => buildRoadmap(decisions), [decisions])
  const packets = useMemo(() => buildPackets(decisions, claims), [decisions, claims])

  const groupedClaims = useMemo(
    () => ({
      opportunity: claims.filter((claim) => claim.type === 'opportunity'),
      risk: claims.filter((claim) => claim.type === 'risk'),
      assumption: claims.filter((claim) => claim.type === 'assumption'),
      unknown: claims.filter((claim) => claim.type === 'unknown'),
    }),
    [claims],
  )

  const saveSession = () => {
    if (!sessionName.trim()) return
    const next: SavedSession = {
      id: crypto.randomUUID(),
      name: sessionName.trim(),
      createdAt: new Date().toISOString(),
      intakeText,
    }
    const merged = [next, ...sessions].slice(0, 20)
    setSessions(merged)
    localStorage.setItem(SESSION_KEY, JSON.stringify(merged))
    setSessionName('')
  }

  const restoreSession = () => {
    if (!activeSession) return
    const found = sessions.find((session) => session.id === activeSession)
    if (!found) return
    setIntakeText(found.intakeText)
  }

  const markdown = toMarkdown('SignalDesk Intelligence Pack', sources, claims, decisions, roadmap, packets)

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <p className="eyebrow">Operator Console</p>
          <h1>SignalDesk</h1>
          <p className="sub">Turn messy context into intelligence briefs, ranked decisions, and execution packets.</p>
        </div>
        <div className="top-actions">
          <button onClick={() => downloadFile('signaldesk-pack.md', markdown, 'text/markdown')}>Export Markdown</button>
          <button
            className="ghost"
            onClick={() =>
              downloadFile(
                'signaldesk-pack.json',
                JSON.stringify({ sources, claims, decisions, roadmap, packets }, null, 2),
                'application/json',
              )
            }
          >
            Export JSON
          </button>
        </div>
      </header>

      <main className="grid">
        <section className="panel">
          <h2>Intake Layer</h2>
          <p className="hint">Paste URLs, notes, transcripts, and docs — one item per line.</p>
          <textarea
            value={intakeText}
            onChange={(event) => setIntakeText(event.target.value)}
            placeholder="https://competitor.com/launch-note\nQ4 pipeline might stall if conversion dips\nTranscript: customer repeatedly asked for API access"
            rows={12}
          />

          <div className="row">
            <input value={sessionName} onChange={(event) => setSessionName(event.target.value)} placeholder="Session name (e.g., GTM Sprint)" />
            <button onClick={saveSession}>Save Session</button>
          </div>

          <div className="row">
            <select value={activeSession} onChange={(event) => setActiveSession(event.target.value)}>
              <option value="">Reload saved session…</option>
              {sessions.map((session) => (
                <option key={session.id} value={session.id}>
                  {session.name} • {new Date(session.createdAt).toLocaleString()}
                </option>
              ))}
            </select>
            <button className="ghost" onClick={restoreSession}>
              Load
            </button>
          </div>

          <ul className="source-list">
            {sources.map((source) => (
              <li key={source.id} className={!source.valid ? 'invalid' : ''}>
                <span className={`badge ${source.type}`}>{source.type}</span>
                <span>{source.raw}</span>
              </li>
            ))}
            {!sources.length ? <li className="empty">No sources parsed yet.</li> : null}
          </ul>
        </section>

        <section className="panel">
          <h2>Intel Engine</h2>
          <div className="claim-grid">
            {(['opportunity', 'risk', 'assumption', 'unknown'] as const).map((key) => (
              <article key={key}>
                <h3>{key}</h3>
                <ul>
                  {groupedClaims[key].length ? (
                    groupedClaims[key].map((claim, index) => (
                      <li key={`${claim.sourceId}-${index}`}>
                        <strong>
                          {claim.confidence} ({claim.confidenceScore})
                        </strong>{' '}
                        {claim.text}
                      </li>
                    ))
                  ) : (
                    <li className="empty">None extracted yet.</li>
                  )}
                </ul>
              </article>
            ))}
          </div>
        </section>

        <section className="panel">
          <h2>Decision Layer</h2>
          <p className="hint">Ranked by weighted impact + urgency − effort with confidence adjustment.</p>
          <ol className="decision-list">
            {decisions.map((decision, index) => (
              <li key={index}>
                <p>{decision.title}</p>
                <small>{decision.rationale}</small>
                <small>
                  Score {decision.score.toFixed(1)} • {decision.horizon} • I:{decision.impact} E:{decision.effort} U:{decision.urgency}
                </small>
              </li>
            ))}
          </ol>

          <div className="roadmap">
            <h3>24h / 7d / 30d roadmap</h3>
            <ul>
              {roadmap.map((item) => (
                <li key={item.horizon}>
                  <span className="horizon">{item.horizon}</span>
                  <div>
                    <p>{item.action}</p>
                    <small>
                      Owner: {item.owner} • Success: {item.successMetric}
                    </small>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="panel">
          <h2>Execution Packets</h2>
          <div className="packet-grid">
            {packets.map((packet) => (
              <article key={packet.role}>
                <div className="packet-head">
                  <h3>{packet.role}</h3>
                  <button
                    className="ghost tiny"
                    onClick={() => downloadFile(`signaldesk-${packet.role.toLowerCase()}-packet.md`, packetToMarkdown(packet), 'text/markdown')}
                  >
                    Export packet
                  </button>
                </div>
                <p>{packet.objective}</p>
                <p className="output">Context: {packet.context}</p>
                <ul>
                  {packet.tasks.map((task) => (
                    <li key={task}>{task}</li>
                  ))}
                </ul>
                <p className="mini-title">Acceptance criteria</p>
                <ul>
                  {packet.acceptanceCriteria.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                <p className="mini-title">Dependencies</p>
                <ul>
                  {packet.dependencies.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                <p className="mini-title">Risks</p>
                <ul>
                  {packet.risks.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                <p className="output">Handoff prompt: {packet.handoffPrompt}</p>
                <p className="output">Output: {packet.output}</p>
              </article>
            ))}
          </div>
        </section>
      </main>
    </div>
  )
}

export default App
