import { useMemo, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import './App.css'
import {
  buildClaims,
  buildDecisions,
  buildPackets,
  buildRoadmap,
  loadSessions,
  packetToMarkdown,
  parseSources,
  saveSessionToStorage,
  toMarkdown,
  type SavedSession,
} from './lib/signaldesk'

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

function validateIntake(intakeText: string) {
  const issues: string[] = []
  if (!intakeText.trim()) issues.push('Intake cannot be empty.')
  if (intakeText.length > 5000) issues.push('Intake exceeds 5,000 characters. Split into smaller sessions.')
  return issues
}

function App() {
  const [intakeText, setIntakeText] = useState('')
  const [sessionName, setSessionName] = useState('')
  const [sessions, setSessions] = useState<SavedSession[]>(() => loadSessions())
  const [activeSession, setActiveSession] = useState('')
  const [notice, setNotice] = useState('Ready.')
  const [storageError, setStorageError] = useState<string | null>(null)

  const sources = useMemo(() => parseSources(intakeText), [intakeText])
  const claims = useMemo(() => buildClaims(sources), [sources])
  const decisions = useMemo(() => buildDecisions(claims), [claims])
  const roadmap = useMemo(() => buildRoadmap(decisions), [decisions])
  const packets = useMemo(() => buildPackets(decisions, claims), [decisions, claims])
  const intakeIssues = useMemo(() => validateIntake(intakeText), [intakeText])

  const groupedClaims = useMemo(
    () => ({
      opportunity: claims.filter((claim) => claim.type === 'opportunity'),
      risk: claims.filter((claim) => claim.type === 'risk'),
      assumption: claims.filter((claim) => claim.type === 'assumption'),
      unknown: claims.filter((claim) => claim.type === 'unknown'),
    }),
    [claims],
  )

  const invalidUrls = sources.filter((source) => source.type === 'url' && !source.valid)
  const hasInput = sources.length > 0

  const markdown = toMarkdown('SignalDesk Intelligence Pack', sources, claims, decisions, roadmap, packets)

  const exportMarkdown = () => {
    if (!hasInput || intakeIssues.length > 0) {
      setNotice('Resolve intake validation issues before exporting.')
      return
    }
    downloadFile('signaldesk-pack.md', markdown, 'text/markdown')
    setNotice('Exported full markdown pack.')
  }

  const exportJson = () => {
    if (!hasInput || intakeIssues.length > 0) {
      setNotice('Resolve intake validation issues before exporting.')
      return
    }
    downloadFile('signaldesk-pack.json', JSON.stringify({ sources, claims, decisions, roadmap, packets }, null, 2), 'application/json')
    setNotice('Exported JSON execution pack.')
  }

  const saveSession = () => {
    if (!sessionName.trim()) {
      setNotice('Add a session name before saving.')
      return
    }
    if (intakeIssues.length > 0) {
      setNotice('Fix intake validation issues before saving.')
      return
    }

    const next: SavedSession = {
      id: crypto.randomUUID(),
      name: sessionName.trim(),
      createdAt: new Date().toISOString(),
      intakeText,
    }

    try {
      const merged = saveSessionToStorage(next, sessions)
      setSessions(merged)
      setSessionName('')
      setStorageError(null)
      setNotice(`Session "${next.name}" saved.`)
    } catch {
      setStorageError('Unable to save session in browser storage. Check storage permissions or quota.')
      setNotice('Session save failed.')
    }
  }

  const restoreSession = () => {
    if (!activeSession) {
      setNotice('Select a saved session to load.')
      return
    }
    const found = sessions.find((session) => session.id === activeSession)
    if (!found) {
      setNotice('Selected session is unavailable.')
      return
    }
    setIntakeText(found.intakeText)
    setNotice(`Loaded session "${found.name}".`)
  }

  const handleGlobalKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    const mod = event.metaKey || event.ctrlKey
    if (!mod) return

    if (event.key.toLowerCase() === 'enter') {
      event.preventDefault()
      exportMarkdown()
    }

    if (event.key.toLowerCase() === 's') {
      event.preventDefault()
      saveSession()
    }
  }

  return (
    <div className="app" onKeyDownCapture={handleGlobalKeyDown}>
      <header className="topbar">
        <div>
          <p className="eyebrow">Operator Console</p>
          <h1>SignalDesk</h1>
          <p className="sub">Turn messy context into intelligence briefs, ranked decisions, and execution packets.</p>
        </div>
        <div className="top-actions">
          <button onClick={exportMarkdown} disabled={!hasInput || intakeIssues.length > 0}>
            Export Markdown
          </button>
          <button className="ghost" onClick={exportJson} disabled={!hasInput || intakeIssues.length > 0}>
            Export JSON
          </button>
        </div>
      </header>

      <section className="status-strip" aria-live="polite">
        <span>{notice}</span>
        <span className="shortcut">⌘/Ctrl+Enter export • ⌘/Ctrl+S save session</span>
      </section>

      <main className="grid">
        <section className="panel">
          <h2>Intake Layer</h2>
          <p className="hint">Paste URLs, notes, transcripts, and docs — one item per line.</p>
          <p className="intake-meta">
            Parsed: {sources.length} source(s)
            {invalidUrls.length ? ` • ${invalidUrls.length} invalid URL(s)` : ' • all URLs valid'}
          </p>
          <textarea
            value={intakeText}
            onChange={(event) => {
              setIntakeText(event.target.value)
              setNotice('Draft updated. Run export when ready.')
            }}
            aria-invalid={intakeIssues.length > 0 || invalidUrls.length > 0}
            placeholder="https://competitor.com/launch-note\nQ4 pipeline might stall if conversion dips\nTranscript: customer repeatedly asked for API access"
            rows={12}
          />

          {intakeIssues.length > 0 && (
            <ul className="validation-list" role="alert">
              {intakeIssues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          )}

          {storageError && (
            <p className="validation-list" role="alert">
              {storageError}
            </p>
          )}

          <div className="row">
            <input
              value={sessionName}
              onChange={(event) => setSessionName(event.target.value)}
              placeholder="Session name (e.g., GTM Sprint)"
              aria-invalid={!sessionName.trim() && notice.includes('session name')}
            />
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
