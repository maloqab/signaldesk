import { useMemo, useState } from 'react'
import './App.css'

type SourceType = 'url' | 'note' | 'transcript' | 'document'
type Confidence = 'high' | 'medium' | 'low'
type PacketRole = 'Coder' | 'Researcher' | 'Writer' | 'Notion'

type SourceItem = {
  id: string
  raw: string
  type: SourceType
  valid: boolean
}

type Claim = {
  text: string
  type: 'opportunity' | 'risk' | 'assumption' | 'unknown'
  confidence: Confidence
  sourceId: string
}

type Decision = {
  title: string
  impact: number
  effort: number
  urgency: number
  score: number
  horizon: '24h' | '7d' | '30d'
}

type Packet = {
  role: PacketRole
  objective: string
  tasks: string[]
  output: string
}

type SavedSession = {
  id: string
  name: string
  createdAt: string
  intakeText: string
}

const SESSION_KEY = 'signaldesk:sessions:v1'

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
  if (lower.includes('transcript') || lower.includes('speaker:') || lower.split(' ').length > 20) return 'transcript'
  if (lower.includes('.pdf') || lower.includes('doc') || lower.includes('report')) return 'document'
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

function inferConfidence(raw: string): Confidence {
  const lower = raw.toLowerCase()
  if (lower.includes('confirmed') || lower.includes('data') || lower.includes('published')) return 'high'
  if (lower.includes('maybe') || lower.includes('possibly') || lower.includes('?')) return 'low'
  return 'medium'
}

function buildClaims(sources: SourceItem[]): Claim[] {
  const claims: Claim[] = []

  for (const source of sources) {
    const lower = source.raw.toLowerCase()

    if (lower.includes('launch') || lower.includes('growth') || lower.includes('demand') || source.type === 'url') {
      claims.push({
        text: `Potential upside from source: ${source.raw.slice(0, 90)}`,
        type: 'opportunity',
        confidence: inferConfidence(source.raw),
        sourceId: source.id,
      })
    }

    if (lower.includes('risk') || lower.includes('decline') || lower.includes('cost') || lower.includes('delay')) {
      claims.push({
        text: `Risk signal detected: ${source.raw.slice(0, 90)}`,
        type: 'risk',
        confidence: inferConfidence(source.raw),
        sourceId: source.id,
      })
    }

    if (lower.includes('assume') || lower.includes('should') || lower.includes('likely')) {
      claims.push({
        text: `Assumption to validate: ${source.raw.slice(0, 90)}`,
        type: 'assumption',
        confidence: 'low',
        sourceId: source.id,
      })
    }

    if (lower.includes('unknown') || lower.includes('tbd') || lower.includes('unclear') || lower.includes('?')) {
      claims.push({
        text: `Unknown requiring evidence: ${source.raw.slice(0, 90)}`,
        type: 'unknown',
        confidence: 'low',
        sourceId: source.id,
      })
    }
  }

  if (!claims.length && sources.length) {
    claims.push({
      text: 'Initial signals captured, but more explicit evidence is needed for high-confidence synthesis.',
      type: 'unknown',
      confidence: 'low',
      sourceId: sources[0].id,
    })
  }

  return claims
}

function buildDecisions(claims: Claim[]): Decision[] {
  const opportunities = claims.filter((c) => c.type === 'opportunity').length
  const risks = claims.filter((c) => c.type === 'risk').length
  const unknowns = claims.filter((c) => c.type === 'unknown').length

  const rows: Omit<Decision, 'score'>[] = [
    {
      title: 'Ship one focused experiment tied to strongest opportunity signal',
      impact: Math.min(10, 5 + opportunities),
      effort: 4,
      urgency: 8,
      horizon: '24h',
    },
    {
      title: 'Run risk sweep and add mitigation owner per critical risk',
      impact: Math.min(10, 4 + risks),
      effort: 5,
      urgency: 7,
      horizon: '7d',
    },
    {
      title: 'Close unknowns with targeted interviews + data pull',
      impact: Math.min(10, 4 + unknowns),
      effort: 6,
      urgency: 6,
      horizon: '30d',
    },
  ]

  return rows
    .map((d) => ({ ...d, score: d.impact * 1.7 + d.urgency * 1.2 - d.effort }))
    .sort((a, b) => b.score - a.score)
}

function buildPackets(decisions: Decision[], claims: Claim[]): Packet[] {
  const top = decisions[0]
  const riskLines = claims.filter((c) => c.type === 'risk').slice(0, 3).map((c) => c.text)

  return [
    {
      role: 'Coder',
      objective: top ? top.title : 'Build the highest-impact execution slice.',
      tasks: [
        'Create implementation plan with milestones (24h/7d).',
        'Implement metrics hooks for decision outcomes.',
        'Ship first thin-slice and document assumptions.',
      ],
      output: 'PR + changelog + measurable success metric.',
    },
    {
      role: 'Researcher',
      objective: 'Resolve top unknowns with evidence.',
      tasks: [
        'Extract unresolved assumptions from brief.',
        'Collect 5 validating/disproving data points.',
        'Summarize confidence changes and recommendation.',
      ],
      output: 'Evidence memo with source table.',
    },
    {
      role: 'Writer',
      objective: 'Communicate strategy in one crisp narrative.',
      tasks: [
        'Draft operator update: context → decision → next actions.',
        `Include risk watchlist (${riskLines.length} current high-signals).`,
        'Publish 200-word brief for team alignment.',
      ],
      output: 'Stakeholder-ready strategy update.',
    },
    {
      role: 'Notion',
      objective: 'Translate roadmap into execution database.',
      tasks: [
        'Create board columns: 24h, 7d, 30d.',
        'Add owner, due date, confidence, and status fields.',
        'Link each card to source evidence and packet role.',
      ],
      output: 'Import-ready task schema for Notion.',
    },
  ]
}

function toMarkdown(title: string, sources: SourceItem[], claims: Claim[], decisions: Decision[], packets: Packet[]): string {
  const lines: string[] = [
    `# ${title}`,
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    '## Intake Sources',
    ...sources.map((s) => `- [${s.type.toUpperCase()}] ${s.raw}`),
    '',
    '## Intelligence Brief',
    ...claims.map((c) => `- (${c.confidence}) ${c.type.toUpperCase()}: ${c.text}`),
    '',
    '## Ranked Decisions',
    ...decisions.map((d) => `- ${d.title} | impact:${d.impact} effort:${d.effort} urgency:${d.urgency} score:${d.score.toFixed(1)}`),
    '',
    '## Execution Packets',
  ]

  packets.forEach((p) => {
    lines.push(`### ${p.role}`)
    lines.push(`- Objective: ${p.objective}`)
    p.tasks.forEach((task) => lines.push(`- Task: ${task}`))
    lines.push(`- Output: ${p.output}`)
    lines.push('')
  })

  return lines.join('\n')
}

function downloadFile(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
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
  const packets = useMemo(() => buildPackets(decisions, claims), [decisions, claims])

  const groupedClaims = useMemo(
    () => ({
      opportunity: claims.filter((c) => c.type === 'opportunity'),
      risk: claims.filter((c) => c.type === 'risk'),
      assumption: claims.filter((c) => c.type === 'assumption'),
      unknown: claims.filter((c) => c.type === 'unknown'),
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
    const found = sessions.find((s) => s.id === activeSession)
    if (!found) return
    setIntakeText(found.intakeText)
  }

  const markdown = toMarkdown('SignalDesk Intelligence Pack', sources, claims, decisions, packets)

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <p className="eyebrow">Operator Console</p>
          <h1>SignalDesk</h1>
          <p className="sub">Turn messy context into decisions and task packets.</p>
        </div>
        <div className="top-actions">
          <button onClick={() => downloadFile('signaldesk-pack.md', markdown, 'text/markdown')}>Export Markdown</button>
          <button
            className="ghost"
            onClick={() => downloadFile('signaldesk-pack.json', JSON.stringify({ sources, claims, decisions, packets }, null, 2), 'application/json')}
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
                        <strong>{claim.confidence}</strong> {claim.text}
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
          <p className="hint">Ranked by impact × urgency minus effort.</p>
          <ol className="decision-list">
            {decisions.map((decision, index) => (
              <li key={index}>
                <p>{decision.title}</p>
                <small>
                  Score {decision.score.toFixed(1)} • {decision.horizon} • I:{decision.impact} E:{decision.effort} U:{decision.urgency}
                </small>
              </li>
            ))}
          </ol>
        </section>

        <section className="panel">
          <h2>Execution Packets</h2>
          <div className="packet-grid">
            {packets.map((packet) => (
              <article key={packet.role}>
                <h3>{packet.role}</h3>
                <p>{packet.objective}</p>
                <ul>
                  {packet.tasks.map((task) => (
                    <li key={task}>{task}</li>
                  ))}
                </ul>
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
