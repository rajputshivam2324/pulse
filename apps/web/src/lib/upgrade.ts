export function buildUpgradeUrl(returnTo?: string | null): string {
  const base = '/account'
  if (!returnTo) return `${base}?upgrade=1`
  const qp = new URLSearchParams({ upgrade: '1', returnTo })
  return `${base}?${qp.toString()}`
}

