import { expect, test } from '@playwright/test'
import { PHOTO, devLogin, uniqueEmail } from './helpers'

test('生成等待卡片展示真实状态、已等待时间和个人中心入口', async ({ page }) => {
  await devLogin(page.request, uniqueEmail('waiting-card'))
  await page.route('**/api/me', async (route) => {
    const response = await route.fetch()
    const body = await response.json()
    if (body.user) body.user.credits = 100
    await route.fulfill({ response, json: body })
  })
  const generation = {
    id: 'gen_waiting_test', status: 'queued', durationSeconds: 6, creditsCost: 6,
    createdAt: new Date(Date.now() - 301_000).toISOString(), videoUrl: null, refunded: false,
  }
  await page.route('**/api/generations', async (route) => {
    if (route.request().method() !== 'POST') return route.continue()
    await route.fulfill({ status: 201, json: { generation } })
  })
  await page.route('**/api/generations/gen_waiting_test', async (route) => {
    await route.fulfill({ json: { generation: { ...generation, status: 'processing' } } })
  })
  await page.goto('/')
  await expect(page.getByTestId('nav-credits')).toBeVisible()
  await page.getByTestId('photo-input').setInputFiles(PHOTO)
  await page.getByTestId('duration-short').click()
  await expect(page.getByTestId('generate')).toBeEnabled()
  await page.getByTestId('generate').click()
  const card = page.getByTestId('generation-status')
  await expect(card).toHaveAttribute('data-status', 'queued')
  await expect(card.getByRole('status')).toHaveText('Your video is in the queue')
  await expect(card.getByTestId('generation-elapsed')).toContainText('Elapsed 05:')
  await expect(card).toContainText('6 credits')
  await expect(card).toContainText('Your video is still processing.')
  await expect(card.getByTestId('generation-view-all')).toHaveAttribute('href', '/dashboard')
  await expect(card).toHaveAttribute('data-status', 'processing', { timeout: 10_000 })
  await expect(card.getByRole('status')).toHaveText('Creating your performance')
})
