import { describe, expect, it } from 'vitest'
import { syncGa4Config } from '../../scripts/pre-deploy.mjs'
import { exampleSecrets } from '../../scripts/sync-secrets.mjs'
import { devVarsKeys } from '../../scripts/sync-plan.mjs'

describe('部署时的 GA4 配置', () => {
  const site = "export const site = { analytics: { ga4Id: 'G-OLD123', cfBeaconToken: '' } }"
  it('写入、清空或在缺省时保留 GA4 ID', () => {
    expect(syncGa4Config(site, 'GA4_MEASUREMENT_ID="G-ABC123"\n')).toContain("ga4Id: 'G-ABC123'")
    expect(syncGa4Config(site, 'GA4_MEASUREMENT_ID=\n')).toContain("ga4Id: ''")
    expect(syncGa4Config(site, 'OTHER=example\n')).toBe(site)
  })
  it('拒绝非法或重复值，且不把标识作为密钥', () => {
    expect(() => syncGa4Config(site, 'GA4_MEASUREMENT_ID=bad\n')).toThrow('格式')
    expect(() => syncGa4Config(site, 'GA4_MEASUREMENT_ID=G-ONE\nGA4_MEASUREMENT_ID=G-TWO\n')).toThrow('重复')
    expect(exampleSecrets('GA4_MEASUREMENT_ID=\nSESSION_SECRET=\n').has('GA4_MEASUREMENT_ID')).toBe(false)
    expect(devVarsKeys('GA4_MEASUREMENT_ID=\nSESSION_SECRET=\n')).toEqual(['SESSION_SECRET'])
  })
})
