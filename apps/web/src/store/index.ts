/**
 * Zustand store for Pulse application state.
 * Manages user session, programs, metrics, and insights.
 * Persists activeProgram and user to localStorage so state survives page refreshes.
 * Uses lazy hydration to avoid SSR/client hydration mismatches.
 */

import { create } from 'zustand'
import { useEffect } from 'react'

interface UserState {
  wallet: string | null
  plan: string
  token: string | null
}

interface ProgramState {
  id: string
  programAddress: string
  name: string | null
  network: string
  lastSyncedAt: string | null
}

interface MetricsState {
  summary: Record<string, unknown> | null
  dawTrend: Record<string, unknown>[]
  retentionCohorts: Record<string, unknown>[]
  funnel: Record<string, unknown>[]
  dropOffByType: Record<string, unknown>[]
  perTypeRetention: Record<string, unknown>[]
}

interface InsightsState {
  headline?: string | null
  biggestProblem?: string | null
  biggest_problem?: string | null
  healthScore?: number
  health_score?: number
  insights: Record<string, unknown>[]
  retentionDiagnosis?: Record<string, unknown> | null
  retention_diagnosis?: Record<string, unknown> | null
  quickWins?: string[]
  quick_wins?: string[]
  executionTrace?: string[]
  execution_trace?: string[]
  suggestedQuestions?: string[]
  suggested_questions?: string[]
  generatedAt?: string
  generated_at?: string
}

export interface InsightChatMessage {
  role: 'user' | 'ai'
  content: string
}

interface PulseStore {
  // Hydration
  _hydrated: boolean
  _hydrate: () => void

  // User
  user: UserState
  linkedWallets: string[]
  isLinkingWallet: boolean
  setUser: (user: Partial<UserState>) => void
  clearUser: () => void
  setLinkedWallets: (wallets: string[]) => void
  setIsLinkingWallet: (isLinking: boolean) => void

  // Programs
  programs: ProgramState[]
  activeProgram: ProgramState | null
  setPrograms: (programs: ProgramState[]) => void
  setActiveProgram: (program: ProgramState | null) => void

  // Metrics — keyed by programId
  metricsByProgram: Record<string, MetricsState | null>
  getMetrics: (programId: string) => MetricsState | null
  setMetrics: (programId: string, metrics: MetricsState | null) => void

  // Insights — keyed by programId
  insightsByProgram: Record<string, InsightsState | null>
  getInsights: (programId: string) => InsightsState | null
  setInsights: (programId: string, insights: InsightsState | null) => void
  clearInsights: (programId: string) => void

  // Follow-up chat — keyed by programId
  insightChatByProgram: Record<string, InsightChatMessage[]>
  insightChatLoadingByProgram: Record<string, boolean>
  getInsightChat: (programId: string) => InsightChatMessage[]
  setInsightChat: (programId: string, messages: InsightChatMessage[]) => void
  addInsightChatMessage: (programId: string, message: InsightChatMessage) => void
  setInsightChatLoading: (programId: string, loading: boolean) => void

  // Loading states — keyed by programId
  isSyncing: boolean
  isGeneratingInsights: boolean
  setSyncing: (val: boolean) => void
  setGeneratingInsights: (val: boolean) => void
}

export const usePulseStore = create<PulseStore>((set, get) => ({
  // Start with defaults (SSR-safe), hydrate on client mount
  _hydrated: false,
  _hydrate: () => {
    if (typeof window === 'undefined') return
    try {
      const token = localStorage.getItem('pulse_token')
      const wallet = localStorage.getItem('pulse_wallet')
      const plan = localStorage.getItem('pulse_plan') || 'free'
      const savedProgram = localStorage.getItem('pulse_active_program')

      set({
        _hydrated: true,
        user: { wallet: wallet || null, plan, token: token || null },
        activeProgram: savedProgram ? JSON.parse(savedProgram) : null,
      })
    } catch {
      set({ _hydrated: true })
    }
  },

  // User defaults
  user: { wallet: null, plan: 'free', token: null },
  linkedWallets: [],
  isLinkingWallet: false,
  setLinkedWallets: (linkedWallets) => set({ linkedWallets }),
  setIsLinkingWallet: (isLinkingWallet) => set({ isLinkingWallet }),
  setUser: (user) =>
    set((state) => {
      const updated = { ...state.user, ...user }
      if (typeof window !== 'undefined') {
        if (updated.token) localStorage.setItem('pulse_token', updated.token)
        if (updated.wallet) localStorage.setItem('pulse_wallet', updated.wallet)
        if (updated.plan) localStorage.setItem('pulse_plan', updated.plan)
      }
      return { user: updated }
    }),
  clearUser: () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('pulse_token')
      localStorage.removeItem('pulse_wallet')
      localStorage.removeItem('pulse_plan')
      localStorage.removeItem('pulse_active_program')
    }
    set({
      user: { wallet: null, plan: 'free', token: null },
      activeProgram: null,
      programs: [],
      metricsByProgram: {},
      insightsByProgram: {},
      insightChatByProgram: {},
      insightChatLoadingByProgram: {},
    })
  },

  // Programs
  programs: [],
  activeProgram: null,
  setPrograms: (programs) => set({ programs }),
  setActiveProgram: (program) => {
    if (typeof window !== 'undefined') {
      if (program) {
        localStorage.setItem('pulse_active_program', JSON.stringify(program))
      } else {
        localStorage.removeItem('pulse_active_program')
      }
    }
    return set({ activeProgram: program })
  },

  // Metrics — keyed by programId
  metricsByProgram: {},
  getMetrics: (programId) => get().metricsByProgram[programId] || null,
  setMetrics: (programId, metrics) =>
    set((state) => ({
      metricsByProgram: { ...state.metricsByProgram, [programId]: metrics },
    })),

  // Insights — keyed by programId
  insightsByProgram: {},
  getInsights: (programId) => get().insightsByProgram[programId] || null,
  setInsights: (programId, insights) =>
    set((state) => ({
      insightsByProgram: {
        ...state.insightsByProgram,
        [programId]: insights
          ? { ...insights, generatedAt: insights.generatedAt || new Date().toISOString() }
          : null,
      },
    })),
  clearInsights: (programId) =>
    set((state) => {
      const rest = { ...state.insightsByProgram }
      delete rest[programId]
      return { insightsByProgram: rest }
    }),

  // Follow-up chat
  insightChatByProgram: {},
  insightChatLoadingByProgram: {},
  getInsightChat: (programId) => get().insightChatByProgram[programId] || [],
  setInsightChat: (programId, messages) =>
    set((state) => ({
      insightChatByProgram: { ...state.insightChatByProgram, [programId]: messages },
    })),
  addInsightChatMessage: (programId, message) =>
    set((state) => ({
      insightChatByProgram: {
        ...state.insightChatByProgram,
        [programId]: [...(state.insightChatByProgram[programId] || []), message],
      },
    })),
  setInsightChatLoading: (programId, loading) =>
    set((state) => ({
      insightChatLoadingByProgram: {
        ...state.insightChatLoadingByProgram,
        [programId]: loading,
      },
    })),

  // Loading
  isSyncing: false,
  isGeneratingInsights: false,
  setSyncing: (isSyncing) => set({ isSyncing }),
  setGeneratingInsights: (isGeneratingInsights) =>
    set({ isGeneratingInsights }),
}))

/**
 * Hook to hydrate the store from localStorage on client mount.
 * Call this once in your root layout or top-level client component.
 */
export function useHydrateStore() {
  const hydrate = usePulseStore((s) => s._hydrate)
  const hydrated = usePulseStore((s) => s._hydrated)
  useEffect(() => {
    if (!hydrated) hydrate()
  }, [hydrate, hydrated])
}
