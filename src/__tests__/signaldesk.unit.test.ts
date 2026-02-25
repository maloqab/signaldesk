import {
  buildClaims,
  buildDecisions,
  hasPendingReview,
  mergeReviewerDecisions,
  intakeScopeKey,
  parseSources,
  reviewerTrail,
  saveReviewerDecision,
  saveSessionToStorage,
  scoreBreakdown,
  type ReviewerDecision,
  type SavedSession,
} from '../lib/signaldesk'

class MemoryStorage implements Storage {
  private data = new Map<string, string>()

  get length() {
    return this.data.size
  }

  clear() {
    this.data.clear()
  }

  getItem(key: string) {
    return this.data.get(key) ?? null
  }

  key(index: number) {
    return Array.from(this.data.keys())[index] ?? null
  }

  removeItem(key: string) {
    this.data.delete(key)
  }

  setItem(key: string, value: string) {
    this.data.set(key, value)
  }
}

describe('SignalDesk unit engine', () => {
  it('parses intake lines and classifies them', () => {
    const sources = parseSources('https://example.com\nQ4 memo indicates cost risk\nTranscript: Speaker: customer wants API')

    expect(sources).toHaveLength(3)
    expect(sources[0]).toMatchObject({ type: 'url', valid: true })
    expect(sources[1]).toMatchObject({ type: 'document' })
    expect(sources[2]).toMatchObject({ type: 'transcript' })
  })

  it('returns deterministic scoring breakdown components', () => {
    const breakdown = scoreBreakdown('Published survey data confirms growth this week', 'document')

    expect(breakdown.signalQuality).toBeGreaterThan(0)
    expect(breakdown.sourceReliability).toBe(24)
    expect(breakdown.recency).toBeGreaterThan(0)
    expect(breakdown.total).toBe(
      Math.max(8, Math.min(95, breakdown.signalQuality + breakdown.sourceReliability + breakdown.recency - breakdown.contradictionPenalty)),
    )
  })

  it('blocks final export when auto-governance leaves needs-review decisions', () => {
    const sources = parseSources('Q4 risk is unknown and maybe declining?')
    const claims = buildClaims(sources)
    const decisions = buildDecisions(claims)

    expect(decisions.some((d) => d.status === 'needs-review')).toBe(true)
    expect(hasPendingReview(decisions)).toBe(true)
  })

  it('persists sessions and reviewer actions into storage wrappers', () => {
    const local = new MemoryStorage()
    const session: SavedSession = {
      id: 's-1',
      name: 'Test Session',
      createdAt: new Date().toISOString(),
      intakeText: 'growth signal',
    }

    const mergedSessions = saveSessionToStorage(session, [], local)
    expect(mergedSessions).toHaveLength(1)
    expect(local.getItem('signaldesk:sessions:v1')).toContain('Test Session')

    const memorySession = new MemoryStorage()
    const review: ReviewerDecision = {
      decisionId: 'd-24h-1',
      status: 'accepted',
      notes: 'validated with owner',
      updatedAt: new Date().toISOString(),
    }
    const map = saveReviewerDecision(review, {}, 'scope:a', memorySession)
    const trail = reviewerTrail(map)

    expect(trail).toHaveLength(1)
    expect(memorySession.getItem('signaldesk:reviewers:v1')).toContain('validated with owner')
  })

  it('applies reviewer status and notes into decision governance', () => {
    const sources = parseSources('https://example.com launch growth data')
    const claims = buildClaims(sources)
    const base = buildDecisions(claims)

    const reviewed = mergeReviewerDecisions(base, {
      [base[0].id]: {
        decisionId: base[0].id,
        status: 'rejected',
        notes: 'out of scope this cycle',
        updatedAt: new Date().toISOString(),
      },
    })

    expect(reviewed[0].status).toBe('rejected')
    expect(reviewed[0].governanceReasons.join(' ')).toContain('out of scope this cycle')
  })

  it('prevents reviewer decisions from dataset A unblocking dataset B', () => {
    const storage = new MemoryStorage()

    const intakeA = 'Q4 risk is unknown and maybe declining?'
    const intakeB = 'Q4 risk is unknown and maybe declining?\nadditional contradictory signal?'

    const scopeA = intakeScopeKey(intakeA)
    const scopeB = intakeScopeKey(intakeB)

    const decisionsA = buildDecisions(buildClaims(parseSources(intakeA)))
    expect(hasPendingReview(decisionsA)).toBe(true)

    const reviewedA = saveReviewerDecision(
      {
        decisionId: decisionsA[0].id,
        status: 'accepted',
        notes: 'approved in dataset A',
        updatedAt: new Date().toISOString(),
      },
      {},
      scopeA,
      storage,
    )

    const mergedA = mergeReviewerDecisions(decisionsA, reviewedA)
    expect(mergedA[0].status).toBe('accepted')

    const decisionsB = buildDecisions(buildClaims(parseSources(intakeB)))
    const scopedReviewerMapB = JSON.parse(storage.getItem('signaldesk:reviewers:v1') || '{}')[scopeB] ?? {}
    const mergedB = mergeReviewerDecisions(decisionsB, scopedReviewerMapB)

    expect(Object.keys(scopedReviewerMapB)).toHaveLength(0)
    expect(hasPendingReview(mergedB)).toBe(true)
  })
})
