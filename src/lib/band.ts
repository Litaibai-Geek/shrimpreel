// Multi-image references for Seedance Mini. Position hints cannot guarantee exact identity mapping.
export const BAND_ROLES = ['Lead singer', 'Keyboard', 'Saxophone', 'Backing singer', 'Drummer'] as const
export const BAND_MAX = 5
export const BAND_MIN = 2

export function isBandUploadIds(value: unknown): value is string[] {
  return Array.isArray(value) && value.length >= BAND_MIN && value.length <= BAND_MAX
    && value.every((id) => typeof id === 'string' && id.startsWith('upl_') && id.length <= 128)
    && new Set(value).size === value.length
}

export function bandPrompt(memberCount: number) {
  if (!Number.isInteger(memberCount) || memberCount < BAND_MIN || memberCount > BAND_MAX) {
    throw new Error('Band needs 2–5 different members')
  }
  return [
    'Generate an original intimate desk-side music performance by a compact live band, with warm lighting and natural camera changes.',
    ...BAND_ROLES.slice(0, memberCount).map((role, i) => `Image ${i + 1} is a distinct adult person playing the ${role.toLowerCase()} role.`),
    'Keep each performer identifiable from their own numbered reference image; do not blend faces or swap roles.',
    'Use Video 1 for performance pacing, framing, and motion cues. The ensemble may include more people than Video 1 shows.',
    'Include wide group shots and individual close-ups where time permits. Use original AI-generated performance sound, not a copyrighted song.',
    'Prioritize distinct faces and coherent instruments. This is an AI-created parody-style video, not a genuine concert.',
  ].join(' ')
}
