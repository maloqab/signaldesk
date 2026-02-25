import { buildClaims, buildDecisions, buildPackets, buildRoadmap, parseSources, toMarkdown } from '../lib/signaldesk'

describe('SignalDesk integration pipeline', () => {
  it('runs intake -> claims -> decisions -> export markdown', () => {
    const intake = [
      'https://example.com/launch growth data confirmed',
      'Q4 report shows churn risk and cost burn',
      'Unknown timeline? Need data before commit',
    ].join('\n')

    const sources = parseSources(intake)
    const claims = buildClaims(sources)
    const decisions = buildDecisions(claims)
    const roadmap = buildRoadmap(decisions)
    const packets = buildPackets(decisions, claims)

    const markdown = toMarkdown('SignalDesk Intelligence Pack', sources, claims, decisions, roadmap, packets)

    expect(sources.length).toBeGreaterThan(0)
    expect(claims.length).toBeGreaterThan(0)
    expect(decisions).toHaveLength(3)
    expect(roadmap).toHaveLength(3)
    expect(packets).toHaveLength(4)
    expect(markdown).toContain('## Ranked Decisions')
    expect(markdown).toContain('## Execution Packets')
  })
})
