// 上传前按比例缩小大图，避免视频服务商拒收过大的像素尺寸。
const MAX_EDGE = 2560

export async function preparePhoto(file: File): Promise<File | null> {
  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    const width = image.naturalWidth, height = image.naturalHeight
    if (!width || !height) throw new Error('invalid image')
    const scale = Math.min(1, MAX_EDGE / Math.max(width, height))
    if (scale === 1) return null
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(width * scale))
    canvas.height = Math.max(1, Math.round(height * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('canvas unavailable')
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.88))
    if (!blob || blob.type !== 'image/jpeg') throw new Error('image encoding failed')
    return new File([blob], 'portrait.jpg', { type: 'image/jpeg' })
  } finally {
    URL.revokeObjectURL(url)
  }
}
