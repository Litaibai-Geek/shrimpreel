import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { generationPhotoIds, takedownMatchSql } from '#/server/takedown-scope'

type Row = Parameters<typeof generationPhotoIds>[0]
const ref = (first: string, members?: string[]) => ({
  upload_id: first,
  provider_meta: members ? JSON.stringify({ mode: 'band', band: { uploadIds: members } }) : null,
}) as Row

describe('Band takedown matching', () => {
  it('reads legacy Solo and 2–5 person Band input IDs in order', () => {
    expect(generationPhotoIds(ref('upl_a'))).toEqual(['upl_a'])
    expect(generationPhotoIds(ref('upl_a', ['upl_a', 'upl_b', 'upl_c']))).toEqual(['upl_a', 'upl_b', 'upl_c'])
    expect(generationPhotoIds({ upload_id: 'upl_a', provider_meta: 'invalid' })).toEqual(['upl_a'])
    expect(generationPhotoIds(ref('upl_a', ['upl_b', 'upl_c']))).toEqual(['upl_a'])
  })

  it('targets member 2 across Band and Solo tasks without removing other members', () => {
    const sqlite = new DatabaseSync(':memory:')
    sqlite.exec(`CREATE TABLE uploads (id TEXT PRIMARY KEY, sha256 TEXT);
      CREATE TABLE generations (id TEXT PRIMARY KEY, upload_id TEXT, provider_meta TEXT, removed_at TEXT);`)
    const addUpload = sqlite.prepare('INSERT INTO uploads (id, sha256) VALUES (?, ?)')
    for (const [id, sha] of [
      ['upl_a', 'hash_a'], ['upl_b', 'hash_b'], ['upl_b_copy', 'hash_b'],
      ['upl_c', 'hash_c'], ['upl_d', 'hash_d'],
    ]) addUpload.run(id, sha)
    const addTask = sqlite.prepare('INSERT INTO generations (id, upload_id, provider_meta) VALUES (?, ?, ?)')
    addTask.run('gen_reported', 'upl_a', ref('upl_a', ['upl_a', 'upl_b', 'upl_c']).provider_meta)
    addTask.run('gen_secondary', 'upl_d', ref('upl_d', ['upl_d', 'upl_b_copy']).provider_meta)
    addTask.run('gen_solo_dup', 'upl_b_copy', null)
    addTask.run('gen_other_member', 'upl_c', null)
    addTask.run('gen_unrelated', 'upl_d', null)
    addTask.run('gen_bad_json', 'upl_d', 'not-json')

    const find = (ids: string[], hashes: string[]) => {
      const sql = takedownMatchSql(ids, hashes)
      const result = sqlite.prepare(`SELECT id FROM generations WHERE removed_at IS NULL AND ${sql.generationSql} ORDER BY id`)
        .all(...sql.generationParams('gen_reported')) as Array<{ id: string }>
      return result.map((row) => row.id)
    }
    expect(find(['upl_b'], ['hash_b'])).toEqual(['gen_reported', 'gen_secondary', 'gen_solo_dup'])
    expect(find(['upl_a', 'upl_b', 'upl_c'], ['hash_a', 'hash_b', 'hash_c'])).toEqual([
      'gen_other_member', 'gen_reported', 'gen_secondary', 'gen_solo_dup',
    ])
    expect(find(['upl_a'], ['hash_a'])).toEqual(['gen_reported'])
    sqlite.close()
  })
})
