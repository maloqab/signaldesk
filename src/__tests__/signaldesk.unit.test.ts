import {
  buildClaims,
  bucketConfidence,
  parseSources,
  saveSessionToStorage,
  scoreConfidence,
  type SavedSession,
} from '../lib/signaldesk'

describe('SignalDesk unit engine', () => {
  it('parses intake lines and classifies them', () => {
    const sources = parseSources('https://example.com\nQ4 memo indicates cost risk\nTranscript: Speaker: customer wants API')

    expect(sources).toHaveLength(3)
    expect(sources[0]).toMatchObject({ type: 'url', valid: true })
    expect(sources[1]).toMatchObject({ type: 'document' })
    expect(sources[2]).toMatchObject({ type: 'transcript' })
  })

  it('extracts claims from mixed risk/opportunity intake', () => {
    const sources = parseSources('Launch win with growth data confirmed\nPotential churn risk and delay')
    const claims = buildClaims(sources)

    expect(claims.some((c) => c.type === 'opportunity')).toBe(true)
    expect(claims.some((c) => c.type === 'risk')).toBe(true)
  })

  it('scores confidence and buckets levels correctly', () => {
    const highScore = scoreConfidence('Published survey data confirms strong retention growth', 'document')
    const lowScore = scoreConfidence('maybe perhaps rumor?', 'note')

    expect(highScore).toBeGreaterThan(lowScore)
    expect(bucketConfidence(highScore)).toBe('high')
    expect(bucketConfidence(lowScore)).toBe('low')
  })

  it('persists sessions into local storage wrapper', () => {
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

    const storage: Storage = new MemoryStorage()

    const session: SavedSession = {
      id: 's-1',
      name: 'Test Session',
      createdAt: new Date().toISOString(),
      intakeText: 'growth signal',
    }

    const merged = saveSessionToStorage(session, [], storage)

    expect(merged).toHaveLength(1)
    expect(storage.getItem('signaldesk:sessions:v1')).toContain('Test Session')
  })
})
