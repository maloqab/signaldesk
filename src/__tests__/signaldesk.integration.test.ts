import {
  buildClaims,
  buildDecisions,
  buildPackets,
  buildRoadmap,
  hasPendingReview,
  mergeReviewerDecisions,
  parseSources,
  reviewerTrail,
  toMarkdown,
} from '../lib/signaldesk'

describe('SignalDesk integration pipeline', () => {
  it('runs intake -> claims -> decisions -> review -> export markdown/json-compatible shape', () => {
    const intake = [
      'https://example.com/launch growth data confirmed',
      'Q4 report shows churn risk and cost burn',
      'Unknown timeline? Need data before commit',
    ].join('\n')

    const sources = parseSources(intake)
    const claims = buildClaims(sources)
    const autoDecisions = buildDecisions(claims)

    const reviewedDecisions = mergeReviewerDecisions(autoDecisions, {
      [autoDecisions[0].id]: {
        decisionId: autoDecisions[0].id,
        status: 'accepted',
        notes: 'approved after sync',
        updatedAt: '2026-02-25T07:40:00.000Z',
      },
    })

    const roadmap = buildRoadmap(reviewedDecisions)
    const packets = buildPackets(reviewedDecisions, claims)
    const trail = reviewerTrail({
      [autoDecisions[0].id]: {
        decisionId: autoDecisions[0].id,
        status: 'accepted',
        notes: 'approved after sync',
        updatedAt: '2026-02-25T07:40:00.000Z',
      },
    })

    const markdown = toMarkdown('SignalDesk Intelligence Pack', sources, claims, reviewedDecisions, roadmap, packets, trail)

    expect(sources.length).toBeGreaterThan(0)
    expect(claims.length).toBeGreaterThan(0)
    expect(reviewedDecisions).toHaveLength(3)
    expect(roadmap).toHaveLength(3)
    expect(packets).toHaveLength(4)
    expect(markdown).toContain('## Ranked Decisions')
    expect(markdown).toContain('## Reviewer Trail')
    expect(markdown).toContain('approved after sync')
    expect(typeof hasPendingReview(autoDecisions)).toBe('boolean')
  })
})
