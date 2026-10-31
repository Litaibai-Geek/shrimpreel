import { isBandUploadIds } from '#/lib/band'
import type { GenerationRow } from './types'

// Band inputs are persisted in provider_meta; legacy Solo input lives in upload_id.
export function generationPhotoIds(g: Pick<GenerationRow, 'upload_id' | 'provider_meta'>): string[] {
  try {
    const data = JSON.parse(g.provider_meta ?? '{}') as { mode?: unknown; band?: { uploadIds?: unknown } }
    const ids = data?.mode === 'band' ? data.band?.uploadIds : null
    if (isBandUploadIds(ids) && ids[0] === g.upload_id) return ids
  } catch { /* Legacy or malformed metadata defaults to the primary image. */ }
  return [g.upload_id]
}

// Affected videos may use a photo as their primary Solo/Band input OR as a
// secondary Band input. Duplicate upload IDs are found via their SHA-256.
export function takedownMatchSql(ids: string[], hashes: string[]) {
  if (!ids.length) throw new Error('Takedown needs at least one photo')
  const uniqueIds = [...new Set(ids)]
  const uniqueHashes = [...new Set(hashes.filter(Boolean))]
  const terms = [`id IN (${uniqueIds.map(() => '?').join(',')})`]
  if (uniqueHashes.length) terms.push(`sha256 IN (${uniqueHashes.map(() => '?').join(',')})`)
  const uploadSql = `(${terms.join(' OR ')})`
  const uploadParams = [...uniqueIds, ...uniqueHashes]
  const matchedUploads = `SELECT id FROM uploads WHERE ${uploadSql}`
  const generationSql = `(id = ? OR upload_id IN (${matchedUploads}) OR EXISTS (
    SELECT 1 FROM json_each(
      CASE WHEN json_valid(provider_meta) THEN provider_meta ELSE '{}' END,
      '$.band.uploadIds'
    ) AS member WHERE member.value IN (${matchedUploads})
  ))`
  return { uploadSql, uploadParams, generationSql,
    generationParams: (generationId: string) => [generationId, ...uploadParams, ...uploadParams] }
}
