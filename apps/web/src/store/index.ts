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

export interface InsightChatThread {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  messages: InsightChatMessage[]
}

const CHAT_THREADS_KEY = 'pulse_insight_chat_threads'
const CHAT_ACTIVE_KEY = 'pulse_insight_chat_active_thread'

function getChatStorageKeys(wallet?: string | null) {
  const suffix = wallet ? `:${wallet}` : ':anonymous'
  return {
    threadsKey: `${CHAT_THREADS_KEY}${suffix}`,
    activeKey: `${CHAT_ACTIVE_KEY}${suffix}`,
  }
}

function readChatStateFromStorage(wallet?: string | null): {
  savedThreads: Record<string, InsightChatThread[]>
  savedActive: Record<string, string | null>
  activeMessagesByProgram: Record<string, InsightChatMessage[]>
} {
  if (typeof window === 'undefined') {
    return { savedThreads: {}, savedActive: {}, activeMessagesByProgram: {} }
  }

  const { threadsKey, activeKey } = getChatStorageKeys(wallet)
  const savedThreadsRaw = localStorage.getItem(threadsKey)
  const savedActiveRaw = localStorage.getItem(activeKey)

  // Backward compatibility: if wallet namespaced keys don't exist yet,
  // fall back to legacy global keys once.
  const threadsSource = savedThreadsRaw ?? localStorage.getItem(CHAT_THREADS_KEY)
  const activeSource = savedActiveRaw ?? localStorage.getItem(CHAT_ACTIVE_KEY)

  const savedThreads = threadsSource ? JSON.parse(threadsSource) as Record<string, InsightChatThread[]> : {}
  const savedActive = activeSource ? JSON.parse(activeSource) as Record<string, string | null> : {}
  const activeMessagesByProgram: Record<string, InsightChatMessage[]> = {}

  Object.entries(savedThreads).forEach(([programId, threads]) => {
    const activeId = savedActive[programId]
    const activeThread = threads.find((t) => t.id === activeId) || threads[0]
    activeMessagesByProgram[programId] = activeThread?.messages || []
  })

  return { savedThreads, savedActive, activeMessagesByProgram }
}

function generateThreadId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `thread_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

function deriveThreadTitle(messages: InsightChatMessage[]): string {
  const firstUser = messages.find((m) => m.role === 'user')
  if (!firstUser) return 'New Chat'
  const trimmed = firstUser.content.trim()
  if (!trimmed) return 'New Chat'
  return trimmed.length > 44 ? `${trimmed.slice(0, 44)}...` : trimmed
}

function persistChatState(
  threadsByProgram: Record<string, InsightChatThread[]>,
  activeByProgram: Record<string, string | null>,
  wallet?: string | null
) {
  if (typeof window === 'undefined') return
  const { threadsKey, activeKey } = getChatStorageKeys(wallet)
  localStorage.setItem(threadsKey, JSON.stringify(threadsByProgram))
  localStorage.setItem(activeKey, JSON.stringify(activeByProgram))
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
  insightChatThreadsByProgram: Record<string, InsightChatThread[]>
  activeInsightChatThreadByProgram: Record<string, string | null>
  insightChatByProgram: Record<string, InsightChatMessage[]>
  insightChatLoadingByProgram: Record<string, boolean>
  getInsightChatThreads: (programId: string) => InsightChatThread[]
  getActiveInsightChatThreadId: (programId: string) => string | null
  hydrateInsightChatThreads: (programId: string, threads: InsightChatThread[], activeThreadId?: string | null) => void
  createInsightChatThread: (programId: string, title?: string) => string
  setActiveInsightChatThread: (programId: string, threadId: string) => void
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
      const { savedThreads, savedActive, activeMessagesByProgram } = readChatStateFromStorage(wallet)

      set({
        _hydrated: true,
        user: { wallet: wallet || null, plan, token: token || null },
        activeProgram: savedProgram ? JSON.parse(savedProgram) : null,
        insightChatThreadsByProgram: savedThreads,
        activeInsightChatThreadByProgram: savedActive,
        insightChatByProgram: activeMessagesByProgram,
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
      const walletChanged = updated.wallet !== state.user.wallet
      let chatPatch = {}

      if (walletChanged) {
        const { savedThreads, savedActive, activeMessagesByProgram } = readChatStateFromStorage(updated.wallet)
        chatPatch = {
          insightChatThreadsByProgram: savedThreads,
          activeInsightChatThreadByProgram: savedActive,
          insightChatByProgram: activeMessagesByProgram,
        }
      }

      if (typeof window !== 'undefined') {
        if (updated.token) localStorage.setItem('pulse_token', updated.token)
        if (updated.wallet) localStorage.setItem('pulse_wallet', updated.wallet)
        if (updated.plan) localStorage.setItem('pulse_plan', updated.plan)
      }
      return { user: updated, ...chatPatch }
    }),
  clearUser: () => {
    if (typeof window !== 'undefined') {
      const wallet = localStorage.getItem('pulse_wallet')
      const { threadsKey, activeKey } = getChatStorageKeys(wallet)
      localStorage.removeItem('pulse_token')
      localStorage.removeItem('pulse_wallet')
      localStorage.removeItem('pulse_plan')
      localStorage.removeItem('pulse_active_program')
      localStorage.removeItem(threadsKey)
      localStorage.removeItem(activeKey)
      // Remove legacy global chat keys as well.
      localStorage.removeItem(CHAT_THREADS_KEY)
      localStorage.removeItem(CHAT_ACTIVE_KEY)
    }
    set({
      user: { wallet: null, plan: 'free', token: null },
      activeProgram: null,
      programs: [],
      metricsByProgram: {},
      insightsByProgram: {},
      insightChatThreadsByProgram: {},
      activeInsightChatThreadByProgram: {},
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
  insightChatThreadsByProgram: {},
  activeInsightChatThreadByProgram: {},
  insightChatByProgram: {},
  insightChatLoadingByProgram: {},
  getInsightChatThreads: (programId) => get().insightChatThreadsByProgram[programId] || [],
  getActiveInsightChatThreadId: (programId) => get().activeInsightChatThreadByProgram[programId] || null,
  hydrateInsightChatThreads: (programId, threads, activeThreadId = null) =>
    set((state) => {
      const safeThreads = Array.isArray(threads) ? threads : []
      const fallbackActive = safeThreads[0]?.id || null
      const nextActive = activeThreadId || state.activeInsightChatThreadByProgram[programId] || fallbackActive
      const activeThread = safeThreads.find((t) => t.id === nextActive) || safeThreads[0]

      const threadsByProgram = { ...state.insightChatThreadsByProgram, [programId]: safeThreads }
      const activeByProgram = { ...state.activeInsightChatThreadByProgram, [programId]: activeThread?.id || null }
      persistChatState(threadsByProgram, activeByProgram, state.user.wallet)
      return {
        insightChatThreadsByProgram: threadsByProgram,
        activeInsightChatThreadByProgram: activeByProgram,
        insightChatByProgram: { ...state.insightChatByProgram, [programId]: activeThread?.messages || [] },
      }
    }),
  createInsightChatThread: (programId, title = 'New Chat') => {
    const threadId = generateThreadId()
    const now = new Date().toISOString()
    set((state) => {
      const existing = state.insightChatThreadsByProgram[programId] || []
      const newThread: InsightChatThread = { id: threadId, title, createdAt: now, updatedAt: now, messages: [] }
      const threads = [newThread, ...existing]
      const threadsByProgram = { ...state.insightChatThreadsByProgram, [programId]: threads }
      const activeByProgram = { ...state.activeInsightChatThreadByProgram, [programId]: threadId }
      persistChatState(threadsByProgram, activeByProgram, state.user.wallet)
      return {
        insightChatThreadsByProgram: threadsByProgram,
        activeInsightChatThreadByProgram: activeByProgram,
        insightChatByProgram: { ...state.insightChatByProgram, [programId]: [] },
      }
    })
    return threadId
  },
  setActiveInsightChatThread: (programId, threadId) =>
    set((state) => {
      const threads = state.insightChatThreadsByProgram[programId] || []
      const activeThread = threads.find((t) => t.id === threadId)
      if (!activeThread) return {}
      const activeByProgram = { ...state.activeInsightChatThreadByProgram, [programId]: threadId }
      persistChatState(state.insightChatThreadsByProgram, activeByProgram, state.user.wallet)
      return {
        activeInsightChatThreadByProgram: activeByProgram,
        insightChatByProgram: { ...state.insightChatByProgram, [programId]: activeThread.messages || [] },
      }
    }),
  getInsightChat: (programId) => {
    const state = get()
    const activeId = state.activeInsightChatThreadByProgram[programId]
    const threads = state.insightChatThreadsByProgram[programId] || []
    if (activeId) {
      const active = threads.find((t) => t.id === activeId)
      if (active) return active.messages
    }
    if (threads[0]) return threads[0].messages
    return state.insightChatByProgram[programId] || []
  },
  setInsightChat: (programId, messages) =>
    set((state) => {
      const threads = state.insightChatThreadsByProgram[programId] || []
      const activeId = state.activeInsightChatThreadByProgram[programId]
      const now = new Date().toISOString()
      let updatedThreads = threads
      let nextActiveId = activeId
      if (activeId && threads.some((t) => t.id === activeId)) {
        updatedThreads = threads.map((t) => (t.id === activeId
          ? { ...t, messages, updatedAt: now, title: deriveThreadTitle(messages) }
          : t
        ))
      } else {
        const id = generateThreadId()
        nextActiveId = id
        updatedThreads = [{ id, title: deriveThreadTitle(messages), createdAt: now, updatedAt: now, messages }, ...threads]
      }
      const threadsByProgram = { ...state.insightChatThreadsByProgram, [programId]: updatedThreads }
      const activeByProgram = { ...state.activeInsightChatThreadByProgram, [programId]: nextActiveId || null }
      persistChatState(threadsByProgram, activeByProgram, state.user.wallet)
      return {
        insightChatThreadsByProgram: threadsByProgram,
        activeInsightChatThreadByProgram: activeByProgram,
        insightChatByProgram: { ...state.insightChatByProgram, [programId]: messages },
      }
    }),
  addInsightChatMessage: (programId, message) =>
    set((state) => {
      const existingThreads = state.insightChatThreadsByProgram[programId] || []
      const currentActiveId = state.activeInsightChatThreadByProgram[programId]
      const fallbackMessages = state.insightChatByProgram[programId] || []

      let activeId = currentActiveId
      let threads = existingThreads
      if (!activeId || !threads.some((t) => t.id === activeId)) {
        const now = new Date().toISOString()
        const migratedThread: InsightChatThread = {
          id: generateThreadId(),
          title: deriveThreadTitle(fallbackMessages),
          createdAt: now,
          updatedAt: now,
          messages: fallbackMessages,
        }
        threads = fallbackMessages.length > 0 ? [migratedThread, ...threads] : threads
        if (!threads.length) {
          const newThread: InsightChatThread = {
            id: generateThreadId(),
            title: 'New Chat',
            createdAt: now,
            updatedAt: now,
            messages: [],
          }
          threads = [newThread]
        }
        activeId = threads[0].id
      }

      const now = new Date().toISOString()
      const updatedThreads = threads.map((thread) => {
        if (thread.id !== activeId) return thread
        const nextMessages = [...thread.messages, message]
        return {
          ...thread,
          messages: nextMessages,
          updatedAt: now,
          title: deriveThreadTitle(nextMessages),
        }
      }).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())

      const activeThread = updatedThreads.find((t) => t.id === activeId)
      const threadsByProgram = { ...state.insightChatThreadsByProgram, [programId]: updatedThreads }
      const activeByProgram = { ...state.activeInsightChatThreadByProgram, [programId]: activeId }
      persistChatState(threadsByProgram, activeByProgram, state.user.wallet)

      return {
        insightChatThreadsByProgram: threadsByProgram,
        activeInsightChatThreadByProgram: activeByProgram,
        insightChatByProgram: { ...state.insightChatByProgram, [programId]: activeThread?.messages || [] },
      }
    }),
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
