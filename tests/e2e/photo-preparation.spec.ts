import { expect, test } from '@playwright/test'
import { devLogin, uniqueEmail } from './helpers'

test('大尺寸照片上传前缩放，服务端保存缩放结果', async ({ page }) => {
  await devLogin(page.request, uniqueEmail('photo-resize'))
  await page.addInitScript(() => {
    const append = FormData.prototype.append
    FormData.prototype.append = function (name: string, value: string | Blob, fileName?: string) {
      if (name === 'prepared' && value instanceof Blob) (window as unknown as { preparedPhoto: Blob }).preparedPhoto = value
      Reflect.apply(append, this, fileName ? [name, value, fileName] : [name, value])
    }
  })
  await page.goto('/')
  await expect(page.getByTestId('nav-credits')).toBeVisible()
  const data = await page.evaluate(async () => {
    const canvas = document.createElement('canvas')
    canvas.width = 1000
    canvas.height = 6108
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#a65c45'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob>((resolve) => canvas.toBlob((value) => resolve(value!), 'image/png'))
    return Array.from(new Uint8Array(await blob.arrayBuffer()))
  })
  const responsePromise = page.waitForResponse((response) => response.url().endsWith('/api/uploads') && response.request().method() === 'POST')
  await page.getByTestId('photo-input').setInputFiles({ name: 'portrait.png', mimeType: 'image/png', buffer: Buffer.from(data) })
  const response = await responsePromise
  expect(response.status()).toBe(201)
  const dimensions = await page.evaluate(async () => {
    const prepared = (window as unknown as { preparedPhoto: Blob }).preparedPhoto
    const image = await createImageBitmap(prepared)
    const size = { width: image.width, height: image.height, type: prepared.type, bytes: prepared.size }
    image.close()
    return size
  })
  expect(dimensions).toMatchObject({ width: 419, height: 2560, type: 'image/jpeg' })
  const upload = (await response.json()).upload
  expect(upload).toMatchObject({ contentType: 'image/jpeg', size: dimensions.bytes })
})
