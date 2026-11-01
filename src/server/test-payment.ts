// 测试套餐独立于公开套餐目录，后端必须校验管理员身份和开关。
export function testPaymentPackage(id: string, enabled: boolean, role: string) {
  return id === 'admin_payment_test' && enabled && role === 'admin'
    ? { id: 'admin_payment_test', credits: 100, priceCents: 1, currency: 'USD' }
    : undefined
}
