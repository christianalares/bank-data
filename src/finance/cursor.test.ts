import { describe, expect, it } from 'vitest'

import { decodeCursor, encodeCursor } from './cursor'

describe('pagination cursor', () => {
  it('round trips timestamp and id values', () => {
    const cursor = {
      timestamp: '2026-07-12T12:00:00.000Z',
      id: 'c09fa7d6-ff0a-4aa8-9430-3d1768e08088',
    }

    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor)
  })

  it('rejects malformed cursors without exposing parser details', () => {
    expect(() => decodeCursor('not-a-cursor')).toThrow('Invalid pagination cursor')
  })
})
