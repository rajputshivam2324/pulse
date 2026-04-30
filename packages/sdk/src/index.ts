/**
 * @pulse/sdk — One-line install for tracking Solana app events.
 * Founders embed this in their frontend to send analytics events to Pulse.
 *
 * Usage:
 * ```ts
 * import { PulseTracker } from '@pulse/sdk'
 *
 * const pulse = new PulseTracker({
 *   programAddress: 'YOUR_PROGRAM_ADDRESS',
 *   apiKey: 'YOUR_API_KEY'
 * })
 *
 * // Track custom events
 * pulse.track('swap_completed', { amount: 100, token: 'SOL' })
 *
 * // Auto-track wallet connections
 * pulse.trackWalletConnect(walletAddress)
 * ```
 */

interface PulseConfig {
  programAddress: string
  apiKey?: string
  endpoint?: string
}

interface TrackEvent {
  event: string
  properties?: Record<string, unknown>
  walletAddress?: string
  timestamp?: string
}

export class PulseTracker {
  private config: PulseConfig
  private endpoint: string
  private queue: TrackEvent[] = []
  private flushInterval: ReturnType<typeof setInterval> | null = null

  constructor(config: PulseConfig) {
    this.config = config
    this.endpoint = config.endpoint || 'https://api.usepulse.xyz'

    // Auto-flush queue every 5 seconds
    this.flushInterval = setInterval(() => this.flush(), 5000)
  }

  /**
   * Track a custom event.
   */
  track(event: string, properties?: Record<string, unknown>): void {
    this.queue.push({
      event,
      properties,
      timestamp: new Date().toISOString(),
    })

    // Flush immediately if queue is large
    if (this.queue.length >= 10) {
      this.flush()
    }
  }

  /**
   * Track a wallet connection event.
   */
  trackWalletConnect(walletAddress: string): void {
    this.track('wallet_connected', { walletAddress })
  }

  /**
   * Track a transaction event.
   */
  trackTransaction(signature: string, type: string, properties?: Record<string, unknown>): void {
    this.track('transaction', {
      signature,
      type,
      ...properties,
    })
  }

  /**
   * Flush the event queue to the Pulse API.
   */
  private async flush(): Promise<void> {
    if (this.queue.length === 0) return

    const events = [...this.queue]
    this.queue = []

    try {
      // TODO: Implement backend /events/batch endpoint to receive SDK events
      await fetch(`${this.endpoint}/events/batch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.config.apiKey
            ? { Authorization: `Bearer ${this.config.apiKey}` }
            : {}),
        },
        body: JSON.stringify({
          programAddress: this.config.programAddress,
          events,
        }),
      })
    } catch (error) {
      // Re-queue failed events
      this.queue.unshift(...events)
      console.warn('[Pulse] Failed to flush events:', error)
    }
  }

  /**
   * Clean up — stop auto-flushing and send remaining events.
   */
  destroy(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval)
    }
    this.flush()
  }
}

export default PulseTracker
