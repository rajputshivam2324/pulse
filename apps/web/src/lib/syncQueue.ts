/**
 * Enqueue program sync on the FastAPI Redis-backed worker and poll until completion.
 */

export type SyncJobPublic = {
  job_id: string
  status: string
  result: Record<string, unknown> | null
  error: string | null
  program_address?: string
  created_at?: string
  updated_at?: string
}

export async function enqueueSyncQueue(
  apiBase: string,
  token: string,
  programAddress: string,
  opts?: { programName?: string | null; force?: boolean }
): Promise<{ job_id: string; status: string }> {
  const p = new URLSearchParams()
  if (opts?.force) p.set('force', 'true')
  if (opts?.programName) p.set('program_name', opts.programName)
  const qs = p.toString() ? `?${p.toString()}` : ''
  const res = await fetch(`${apiBase}/analytics/sync-queue/${programAddress}${qs}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    const e = await res.json().catch(() => ({})) as { detail?: string }
    throw new Error(e.detail || `Enqueue failed (${res.status})`)
  }
  return res.json() as Promise<{ job_id: string; status: string }>
}

export async function pollSyncJob(
  apiBase: string,
  token: string,
  jobId: string,
  opts?: { intervalMs?: number; maxWaitMs?: number }
): Promise<SyncJobPublic> {
  /** Poll frequently so the UI picks up completion quickly (under job GET rate limit). */
  const intervalMs = opts?.intervalMs ?? 800
  const maxWaitMs = opts?.maxWaitMs ?? 900_000
  const start = Date.now()
  while (Date.now() - start < maxWaitMs) {
    const res = await fetch(`${apiBase}/analytics/sync-queue/jobs/${jobId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) {
      const e = await res.json().catch(() => ({})) as { detail?: string }
      throw new Error(e.detail || `Job poll failed (${res.status})`)
    }
    const j = (await res.json()) as SyncJobPublic
    if (j.status === 'completed' || j.status === 'failed') return j
    await new Promise((r) => setTimeout(r, intervalMs))
  }
  throw new Error('Sync job timed out while waiting for completion.')
}

export async function runProgramSyncViaQueue(
  apiBase: string,
  token: string,
  programAddress: string,
  opts?: { programName?: string | null; force?: boolean; pollIntervalMs?: number; maxWaitMs?: number }
): Promise<Record<string, unknown>> {
  const { job_id } = await enqueueSyncQueue(apiBase, token, programAddress, {
    programName: opts?.programName,
    force: opts?.force,
  })
  const job = await pollSyncJob(apiBase, token, job_id, {
    intervalMs: opts?.pollIntervalMs,
    maxWaitMs: opts?.maxWaitMs,
  })
  if (job.status === 'failed') {
    throw new Error(job.error || 'Sync failed')
  }
  const result = job.result
  if (!result || typeof result !== 'object') {
    throw new Error('Sync completed but no result payload.')
  }
  return result as Record<string, unknown>
}
