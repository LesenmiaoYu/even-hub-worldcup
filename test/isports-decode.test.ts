import { describe, it, expect } from 'vitest'
import {
  decodeStatus,
  decodeEventType,
  decodeStage,
} from '../server/isports/decode'

describe('decodeStatus', () => {
  it('maps not-started codes to scheduled', () => {
    expect(decodeStatus(0)).toBe('scheduled')
    expect(decodeStatus(-11)).toBe('scheduled') // TBD
  })

  it('maps in-progress codes to live', () => {
    expect(decodeStatus(1)).toBe('live') // first half
    expect(decodeStatus(2)).toBe('live') // half time
    expect(decodeStatus(3)).toBe('live') // second half
    expect(decodeStatus(4)).toBe('live') // extra time
    expect(decodeStatus(5)).toBe('live') // penalty shootout
  })

  it('maps -1 to ft', () => {
    expect(decodeStatus(-1)).toBe('ft')
  })

  it('maps all cancelled-bucket codes to cancelled', () => {
    expect(decodeStatus(-10)).toBe('cancelled')
    expect(decodeStatus(-12)).toBe('cancelled')
    expect(decodeStatus(-13)).toBe('cancelled')
    expect(decodeStatus(-14)).toBe('cancelled')
  })

  it('treats unknown ints as cancelled (safe default)', () => {
    expect(decodeStatus(99)).toBe('cancelled')
    expect(decodeStatus(-999)).toBe('cancelled')
  })
})

describe('decodeEventType', () => {
  it('maps known iSports types per docs id=15', () => {
    expect(decodeEventType(1)).toBe('goal')          // goal
    expect(decodeEventType(2)).toBe('red')           // red card (NOT yellow)
    expect(decodeEventType(3)).toBe('yellow')        // yellow card (NOT red)
    expect(decodeEventType(7)).toBe('goal')          // penalty scored → goal
    expect(decodeEventType(8)).toBe('goal')          // own goal → goal
    expect(decodeEventType(9)).toBe('red')           // second yellow → red on field
    expect(decodeEventType(11)).toBe('sub')          // substitution (NOT 4)
  })

  it('returns null for unmodelled types (penalty missed, VAR, unknown)', () => {
    expect(decodeEventType(13)).toBeNull()           // penalty missed
    expect(decodeEventType(14)).toBeNull()           // VAR review
    expect(decodeEventType(0)).toBeNull()
    expect(decodeEventType(4)).toBeNull()            // unused — agent had guessed this was sub
    expect(decodeEventType(99)).toBeNull()
  })
})

describe('decodeStage', () => {
  it('maps Group stage → GS', () => {
    expect(decodeStage('Group stage', 'A')).toBe('GS')
    expect(decodeStage('group stage', '')).toBe('GS') // case insensitive
  })

  it('maps 1/8 Final and Round of 16 → R16', () => {
    expect(decodeStage('1/8 Final', '')).toBe('R16')
    expect(decodeStage('Round of 16', '')).toBe('R16')
  })

  it('maps quarter-final variants → QF', () => {
    expect(decodeStage('Quarterfinals', '')).toBe('QF')
    expect(decodeStage('Quarter-finals', '')).toBe('QF')
  })

  it('maps semi-final variants → SF', () => {
    expect(decodeStage('Semifinal', '')).toBe('SF')
    expect(decodeStage('Semifinals', '')).toBe('SF')
    expect(decodeStage('Semi-finals', '')).toBe('SF')
  })

  it('maps final variants → F', () => {
    expect(decodeStage('Finals', '')).toBe('F')
    expect(decodeStage('Final', '')).toBe('F')
  })

  it('maps third-place variants → 3rd', () => {
    expect(decodeStage('Third runner', '')).toBe('3rd')
    expect(decodeStage('3rd place play-off', '')).toBe('3rd')
  })

  it('returns null for round-of-32 (no slot in our Stage union)', () => {
    expect(decodeStage('1/16Final', '')).toBeNull()
    expect(decodeStage('1/16 Final', '')).toBeNull()
    expect(decodeStage('Round of 32', '')).toBeNull()
  })

  it('returns null for unrecognised rounds', () => {
    expect(decodeStage('', '')).toBeNull()
    expect(decodeStage('Friendlies', '')).toBeNull()
  })
})
