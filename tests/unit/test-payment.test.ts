import { describe, expect, it } from 'vitest'
import { testPaymentPackage } from '../../src/server/test-payment'

describe('管理员真实支付测试套餐', () => {
  it('仅在启用时向管理员提供固定价格和积分', () => {
    expect(testPaymentPackage('admin_payment_test', true, 'admin')).toEqual({ id: 'admin_payment_test', credits: 100, priceCents: 1, currency: 'USD' })
    expect(testPaymentPackage('admin_payment_test', true, 'user')).toBeUndefined()
    expect(testPaymentPackage('admin_payment_test', false, 'admin')).toBeUndefined()
    expect(testPaymentPackage('starter', true, 'admin')).toBeUndefined()
  })
})
