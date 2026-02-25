import { useMemo, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import './App.css'
import {
  buildClaims,
  buildDecisions,
  buildPackets,
  buildRoadmap,
  hasPendingReview,
  loadReviewerDecisions,
  loadSessions,
  mergeReviewerDecisions,
  packetToMarkdown,
  parseSources,
  reviewerTrail,
  saveReviewerDecision,
  saveSessionToStorage,
  toMarkdown,
  type DecisionStatus,
  type ReviewerDecision,
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
  const [reviewers, setReviewers] = useState<Record<string, ReviewerDecision>>(() => loadReviewerDecisions())

  const sources = useMemo(() => parseSources(intakeText), [intakeText])
  const claims = useMemo(() => buildClaims(sources), [sources])
  const baseDecisions = useMemo(() => buildDecisions(claims), [claims])
  const decisions = useMemo(() => mergeReviewerDecisions(baseDecisions, reviewers), [baseDecisions, reviewers])
  const roadmap = useMemo(() => buildRoadmap(decisions), [decisions])
  const packets = useMemo(() => buildPackets(decisions, claims), [decisions, claims])
  const intakeIssues = useMemo(() => validateIntake(intakeText), [intakeText])
  const pendingReview = useMemo(() => hasPendingReview(decisions), [decisions])
  const trail = useMemo(() => reviewerTrail(reviewers), [reviewers])

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

  const markdown = toMarkdown('SignalDesk Intelligence Pack', sources, claims, decisions, roadmap, packets, trail)

  const blockedExportReason = pendingReview
    ? 'Final export is blocked: one or more decisions still need review.'
    : intakeIssues.length > 0
      ? 'Resolve intake validation issues before exporting.'
      : ''

  const exportMarkdown = () => {
    if (!hasInput || blockedExportReason) {
      setNotice(blockedExportReason || 'Add at least one source before exporting.')
      return
    }
    downloadFile('signaldesk-pack.md', markdown, 'text/markdown')
    setNotice('Exported final markdown pack.')
  }

  const exportJson = () => {
    if (!hasInput || blockedExportReason) {
      setNotice(blockedExportReason || 'Add at least one source before exporting.')
      return
    }
    downloadFile('signaldesk-pack.json', JSON.stringify({ sources, claims, decisions, roadmap, packets, reviewerTrail: trail }, null, 2), 'application/json')
    setNotice('Exported final JSON execution pack.')
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

  const updateReviewer = (decisionId: string, status: DecisionStatus, notes: string) => {
    const entry: ReviewerDecision = {
      decisionId,
      status,
      notes,
      updatedAt: new Date().toISOString(),
    }

    try {
      const next = saveReviewerDecision(entry, reviewers)
      setReviewers(next)
      setStorageError(null)
      setNotice(`Reviewer action saved for ${decisionId}.`)
    } catch {
      setStorageError('Unable to persist reviewer actions in session storage.')
      setNotice('Reviewer save failed.')
    }
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
          <p className="sub">Turn messy context into intelligence briefs, governed decisions, and reviewable execution packets.</p>
        </div>
        <div className="top-actions">
          <button onClick={exportMarkdown} disabled={!hasInput || !!blockedExportReason}>
            Export Markdown (Final)
          </button>
          <button className="ghost" onClick={exportJson} disabled={!hasInput || !!blockedExportReason}>
            Export JSON (Final)
          </button>
        </div>
      </header>

      <section className="status-strip" aria-live="polite">
        <span>{notice}</span>
        <span className="shortcut">⌘/Ctrl+Enter export • ⌘/Ctrl+S save session</span>
      </section>

      {blockedExportReason && (
        <section className="validation-list" role="alert">
          {blockedExportReason}
        </section>
      )}

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
                        <small>
                          {' '}
                          Why: SQ {claim.scoreBreakdown.signalQuality}, SR {claim.scoreBreakdown.sourceReliability}, R {claim.scoreBreakdown.recency}, P -
                          {claim.scoreBreakdown.contradictionPenalty}
                        </small>
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
          <h2>Decision Governance</h2>
          <p className="hint">Deterministic score breakdown + reviewer disposition controls.</p>
          <ol className="decision-list">
            {decisions.map((decision) => {
              const review = reviewers[decision.id]
              return (
                <li key={decision.id}>
                  <p>{decision.title}</p>
                  <small>{decision.rationale}</small>
                  <small>
                    Score {decision.score.toFixed(1)} • status: <strong>{decision.status}</strong> • {decision.horizon} • I:{decision.impact} E:{decision.effort} U:
                    {decision.urgency}
                  </small>
                  <small>
                    Why this score: SQ {decision.scoreBreakdown.signalQuality}, SR {decision.scoreBreakdown.sourceReliability}, R {decision.scoreBreakdown.recency}, P -
                    {decision.scoreBreakdown.contradictionPenalty}
                  </small>
                  <small>Governance: {decision.governanceReasons.join(' | ')}</small>
                  <div className="review-controls">
                    <select
                      value={review?.status ?? decision.status}
                      onChange={(event) => updateReviewer(decision.id, event.target.value as DecisionStatus, review?.notes ?? '')}
                    >
                      <option value="accepted">accepted</option>
                      <option value="needs-review">needs-review</option>
                      <option value="rejected">rejected</option>
                    </select>
                    <input
                      value={review?.notes ?? ''}
                      placeholder="Reviewer notes"
                      onChange={(event) => updateReviewer(decision.id, review?.status ?? decision.status, event.target.value)}
                    />
                  </div>
                </li>
              )
            })}
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
          <h2>Execution Packets + Reviewer Trail</h2>
          <p className="hint">Reviewer actions are persisted in session storage and exported with final artifacts.</p>
          <ul className="source-list">
            {trail.length ? (
              trail.map((item) => (
                <li key={item.decisionId + item.updatedAt}>
                  <span className="badge note">{item.status}</span>
                  <span>
                    {item.decisionId} • {new Date(item.updatedAt).toLocaleString()} {item.notes ? `• ${item.notes}` : ''}
                  </span>
                </li>
              ))
            ) : (
              <li className="empty">No reviewer actions yet.</li>
            )}
          </ul>

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
              </article>
            ))}
          </div>
        </section>
      </main>
    </div>
  )
}

export default App
