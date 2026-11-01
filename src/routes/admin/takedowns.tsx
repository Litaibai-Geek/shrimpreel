import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { AdminPage, FilterSelect, LoadState, PAGE_SIZE, Pager, Status, adminAction, promptNote, shortDate, useAdminData } from '#/components/admin'

export const Route = createFileRoute('/admin/takedowns')({
  component: AdminTakedowns,
})

type TakedownRow = {
  id: string
  reporter_name: string
  reporter_email: string
  reporter_user_id: string | null
  content_ref: string
  generation_id: string | null
  reason: string
  details: string | null
  is_depicted: number
  status: 'open' | 'removed' | 'rejected'
  due_at: string
  resolved_at: string | null
  resolution_note: string | null
  created_at: string
  generation_status: string | null
  generation_removed_at: string | null
  has_output: number | null
  owner_email: string | null
  band_upload_ids: string | null
}

const REASONS: Record<string, string> = {
  intimate: '未经同意的私密内容',
  impersonation: '冒充 / 欺骗性深伪',
  minor: '涉及未成年人',
  copyright: '版权 / 商标',
  other: '其他',
}

// 举报处理：Solo 清理同源；Band 必须明确选择被举报者或全部成员。
function AdminTakedowns() {
  const [status, setStatus] = useState<'open' | 'removed' | 'rejected'>('open')
  const [page, setPage] = useState(1)
  const { data, error, loading, reload } = useAdminData<{ takedowns: TakedownRow[] }>(`/api/admin/takedowns?status=${status}&page=${page}`)
  const rows = data?.takedowns ?? []
  const now = Date.now()

  async function remove(t: TakedownRow) {
    const generationId = prompt('要下架的生成任务 ID（gen_…）', t.generation_id ?? '')?.trim()
    if (!generationId) return
    let memberUploadId: string | undefined
    let scope = '被举报视频及其关联照片'
    if (t.band_upload_ids) {
      let members: string[] = []
      try {
        const value: unknown = JSON.parse(t.band_upload_ids)
        if (Array.isArray(value) && value.every((id) => typeof id === 'string')) members = value
      } catch { /* Older tasks may lack valid Band metadata. */ }
      if (members.length >= 2) {
        const choice = prompt(
          `Band 视频有 ${members.length} 位成员（1 主唱、2 键盘、3 萨克斯、4 伴唱、5 鼓手）。请输入受影响成员的序号 1–${members.length}，或明确输入 all 表示全员。留空不会下架。`,
          '',
        )
        if (choice === null || !choice.trim()) return
        if (choice.trim().toLowerCase() === 'all') {
          scope = '所有 Band 成员（会把所有人的原图拉黑）'
        } else {
          const index = Number(choice.trim())
          if (!Number.isInteger(index) || index < 1 || index > members.length) {
            alert('成员序号无效，没有执行下架')
            return
          }
          memberUploadId = members[index - 1]!
          scope = `第 ${index} 位成员（${memberUploadId}）`
        }
      }
    }
    const note = prompt('处理备注（可选）')?.trim() ?? ''
    const ok = await adminAction(
      `/api/admin/takedowns/${t.id}/resolve`,
      { action: 'remove', generationId, ...(memberUploadId ? { memberUploadId } : {}), note },
      `确认永久下架？对象：${scope}。其关联视频与照片会被删除，指定照片会禁止再次上传。`,
    )
    if (ok) await reload()
  }

  async function reject(t: TakedownRow) {
    const note = promptNote('驳回原因（必填，会记录在审计日志）')
    if (!note) return
    if (await adminAction(`/api/admin/takedowns/${t.id}/resolve`, { action: 'reject', note })) await reload()
  }

  return (
    <AdminPage title="举报下架">
      <FilterSelect
        label="状态"
        value={status}
        onChange={(v) => {
          setStatus(v as 'open' | 'removed' | 'rejected')
          setPage(1)
        }}
        options={[
          ['open', '待处理'],
          ['removed', '已下架'],
          ['rejected', '已驳回'],
        ]}
      />
      <LoadState loading={loading && !data} error={error} empty={!!data && !rows.length} />
      <div className="space-y-3" data-testid="admin-takedowns">
        {rows.map((t) => {
          const overdue = t.status === 'open' && Date.parse(t.due_at) < now
          return (
            <div key={t.id} className="card space-y-3 p-5" data-testid="takedown-item" data-id={t.id}>
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="chip">{REASONS[t.reason] ?? t.reason}</span>
                  <Status value={t.status} />
                  <span className="font-medium">{t.reporter_name}</span>
                  <a href={`mailto:${t.reporter_email}`} className="text-muted hover:underline">
                    {t.reporter_email}
                  </a>
                  {t.is_depicted ? <span className="text-xs text-muted">本人或授权代理</span> : null}
                </div>
                <div className="text-xs text-muted">
                  提交 {shortDate(t.created_at)} ·{' '}
                  <span className={overdue ? 'font-semibold text-red-600' : ''}>截止 {shortDate(t.due_at)}{overdue ? '（已超时）' : ''}</span>
                </div>
              </div>
              <p className="text-sm break-all">
                <span className="text-muted">内容：</span>
                {t.content_ref}
              </p>
              {t.details ? <p className="whitespace-pre-wrap text-sm leading-6">{t.details}</p> : null}
              <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
                {t.generation_id ? (
                  <>
                    <span className="font-mono">{t.generation_id}</span>
                    {t.owner_email ? <span>所属用户 {t.owner_email}</span> : <span>未找到该任务</span>}
                    {t.generation_status ? <Status value={t.generation_removed_at ? 'removed' : t.generation_status} /> : null}
                    {t.has_output ? (
                      <a href={`/api/admin/generations/${t.generation_id}/video`} target="_blank" rel="noreferrer" className="underline">
                        预览成片
                      </a>
                    ) : null}
                  </>
                ) : (
                  <span>未识别到任务 ID，需要人工定位</span>
                )}
              </div>
              {t.status === 'open' ? (
                <div className="flex gap-2">
                  <button type="button" className="btn-primary px-3 py-1.5 text-xs" onClick={() => remove(t)}>
                    下架内容
                  </button>
                  <button type="button" className="btn-ghost px-3 py-1.5 text-xs" onClick={() => reject(t)}>
                    驳回
                  </button>
                </div>
              ) : (
                <p className="text-xs text-muted">
                  {shortDate(t.resolved_at)} 处理{t.resolution_note ? `：${t.resolution_note}` : ''}
                </p>
              )}
            </div>
          )
        })}
      </div>
      <Pager page={page} onPage={setPage} hasMore={rows.length === PAGE_SIZE} />
    </AdminPage>
  )
}
