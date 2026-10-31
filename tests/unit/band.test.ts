import { describe, it, expect } from 'vitest'
import { BAND_ROLES, bandPrompt, isBandUploadIds } from '#/lib/band'

describe('Band input contract', () => {
  it('accepts 2–5 different uploaded photos', () => {
    for (let n = 2; n <= 5; n++) {
      expect(isBandUploadIds(Array.from({ length: n }, (_, i) => `upl_${i}`))).toBe(true)
      expect(bandPrompt(n)).toContain(`Image ${n}`)
    }
    expect(BAND_ROLES).toHaveLength(5)
  })
  it('rejects duplicate or invalid photo references', () => {
    expect(isBandUploadIds(['upl_1'])).toBe(false)
    expect(isBandUploadIds(['upl_1', 'upl_1'])).toBe(false)
    expect(isBandUploadIds(['upl_1', 'another-account'])).toBe(false)
    expect(isBandUploadIds(Array.from({ length: 6 }, (_, i) => `upl_${i}`))).toBe(false)
    expect(isBandUploadIds(null)).toBe(false)
  })
})
