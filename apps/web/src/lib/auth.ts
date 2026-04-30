/**
 * SIWS (Sign In With Solana) authentication flow.
 * No email, no password — just wallet signature verification.
 */

const API_BASE = process.env.NEXT_PUBLIC_FASTAPI_URL || 'http://localhost:8000'

export async function signInWithSolana(
  publicKey: string,
  signMessage: (msg: Uint8Array) => Promise<Uint8Array>
): Promise<string> {
  // Step 1: Get nonce
  const res = await fetch('/api/auth/nonce', {
    method: 'POST',
    body: JSON.stringify({ wallet: publicKey }),
    headers: { 'Content-Type': 'application/json' },
  })
  if (!res.ok) {
    const errorText = await res.text()
    throw new Error(`Failed to fetch nonce: ${res.status} ${errorText}`)
  }
  const { nonce } = await res.json()

  // Step 2: Sign message — no transaction, no gas fee
  const message = new TextEncoder().encode(
    `Sign in to Pulse\n\nWallet: ${publicKey}\nNonce: ${nonce}\n\nThis will not trigger any blockchain transaction.`
  )
  const signature = await signMessage(message)

  // Step 3: Verify and receive JWT
  const verifyRes = await fetch('/api/auth/verify', {
    method: 'POST',
    body: JSON.stringify({
      wallet: publicKey,
      signature: Array.from(signature),
      nonce,
    }),
    headers: { 'Content-Type': 'application/json' },
  })
  if (!verifyRes.ok) {
    const errorText = await verifyRes.text()
    throw new Error(`Failed to verify signature: ${verifyRes.status} ${errorText}`)
  }
  const { token } = await verifyRes.json()

  localStorage.setItem('pulse_token', token)
  return token
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('pulse_token')
}

export function clearToken(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('pulse_token')
  }
}

export function isAuthenticated(): boolean {
  return !!getToken()
}

/**
 * Make an authenticated fetch to the FastAPI backend.
 */
export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const token = getToken()
  return fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })
}
