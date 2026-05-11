'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { usePulseStore } from '@/store'
import { useShallow } from 'zustand/react/shallow'
import { FormattedMessage } from '@/components/chat/FormattedMessage'

const API_BASE = process.env.NEXT_PUBLIC_FASTAPI_URL || 'http://localhost:8000'

export default function InsightChatPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const programId = params.programId as string
  const suggestedQuestion = searchParams.get('q') || ''

  const {
    user,
    activeProgram,
    insightsByProgram,
    insightChatThreadsByProgram,
    activeInsightChatThreadByProgram,
    insightChatLoadingByProgram,
    createInsightChatThread,
    setActiveInsightChatThread,
    addInsightChatMessage,
    setInsightChatLoading,
  } = usePulseStore(useShallow((s) => ({
    user: s.user,
    activeProgram: s.activeProgram,
    insightsByProgram: s.insightsByProgram,
    insightChatThreadsByProgram: s.insightChatThreadsByProgram,
    activeInsightChatThreadByProgram: s.activeInsightChatThreadByProgram,
    insightChatLoadingByProgram: s.insightChatLoadingByProgram,
    createInsightChatThread: s.createInsightChatThread,
    setActiveInsightChatThread: s.setActiveInsightChatThread,
    addInsightChatMessage: s.addInsightChatMessage,
    setInsightChatLoading: s.setInsightChatLoading,
  })))

  const [chatInput, setChatInput] = useState(suggestedQuestion)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const listRef = useRef<HTMLDivElement | null>(null)
  const threads = useMemo(
    () => (programId ? insightChatThreadsByProgram[programId] || [] : []),
    [insightChatThreadsByProgram, programId]
  )
  const activeThreadId = programId ? activeInsightChatThreadByProgram[programId] || null : null
  const activeThread = activeThreadId ? threads.find((t) => t.id === activeThreadId) : threads[0]
  const chatMessages = activeThread?.messages || []
  const chatLoading = programId ? insightChatLoadingByProgram[programId] || false : false
  const insightData = programId ? insightsByProgram[programId] : null
  const baseSuggestions = useMemo(
    () => ((insightData?.suggestedQuestions || insightData?.suggested_questions || []) as string[]).slice(0, 4),
    [insightData]
  )
  const visibleSuggestions = suggestions.length ? suggestions : baseSuggestions

  useEffect(() => {
    listRef.current?.scrollTo({
      top: listRef.current.scrollHeight,
      behavior: 'smooth',
    })
  }, [chatMessages.length, chatLoading])

  useEffect(() => {
    if (!programId) return
    if (threads.length === 0) {
      const initialTitle = suggestedQuestion ? 'Quick follow-up' : 'New Chat'
      const id = createInsightChatThread(programId, initialTitle)
      setActiveInsightChatThread(programId, id)
      return
    }
    if (!activeThreadId) {
      setActiveInsightChatThread(programId, threads[0].id)
    }
  }, [activeThreadId, createInsightChatThread, programId, setActiveInsightChatThread, suggestedQuestion, threads])

  const sendFollowup = useCallback(async (override?: string) => {
    const question = (override ?? chatInput).trim()
    if (!question || !user.token || !programId || chatLoading) return

    setChatInput('')
    if (!activeThread?.id) return
    addInsightChatMessage(programId, { role: 'user', content: question })
    setInsightChatLoading(programId, true)
    try {
      const res = await fetch(`${API_BASE}/insights/followup/${programId}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${user.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          question,
          program_name: activeProgram?.name || programId,
        }),
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.detail || 'Follow-up failed.')
      }
      const data = await res.json()
      addInsightChatMessage(programId, { role: 'ai', content: data.answer || 'No answer returned.' })
      if (Array.isArray(data.suggested_followups) && data.suggested_followups.length) {
        setSuggestions(data.suggested_followups.slice(0, 4))
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Follow-up failed.'
      addInsightChatMessage(programId, { role: 'ai', content: message })
    } finally {
      setInsightChatLoading(programId, false)
    }
  }, [activeProgram, activeThread?.id, addInsightChatMessage, chatInput, chatLoading, programId, setInsightChatLoading, user.token])

  const startNewChat = useCallback(() => {
    if (!programId) return
    const id = createInsightChatThread(programId, 'New Chat')
    setActiveInsightChatThread(programId, id)
    setChatInput('')
    setSuggestions([])
  }, [createInsightChatThread, programId, setActiveInsightChatThread])

  return (
    <div className="h-screen relative overflow-hidden flex flex-col">
      <header className="sticky top-0 z-50 machined-panel px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4 min-w-0">
          <button
            onClick={() => router.push(`/dashboard/${programId}/insights`)}
            className="flex items-center gap-2 f1-m text-[10px] uppercase tracking-widest text-black/60 hover:text-black transition-colors shrink-0"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Insights
          </button>
          <div className="w-px h-6 bg-black/20" />
          <button
            onClick={() => setSidebarOpen((v) => !v)}
            className="btn text-[10px] uppercase tracking-widest"
          >
            <span className="btn-label">{sidebarOpen ? 'Hide Chats' : 'Show Chats'}</span>
          </button>
          <div className="min-w-0">
            <h1 className="text-sm f1-h font-bold text-black/80 uppercase truncate">AI Follow-up Chat</h1>
            <p className="text-[10px] f1-m uppercase tracking-widest text-black/55 truncate">{activeProgram?.name || programId}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={startNewChat}
            className="btn text-[10px] uppercase tracking-widest"
          >
            <span className="btn-label">New Chat</span>
          </button>
          <span className="tag">{chatMessages.length} messages</span>
        </div>
      </header>

      <main className="relative z-10 w-full px-0 pt-0 pb-0 flex-1 min-h-0 overflow-hidden">
        <section className="overflow-hidden rounded-none h-full border-t border-black/10 bg-[linear-gradient(160deg,#c0c0d4_0%,#d8d8ea_8%,#eeeef8_14%,#fafafe_17%,#ffffff_18%,#f4f4fa_19%,#e0e0f0_23%,#c4c4d8_30%,#d8d8ea_38%,#f2f2fa_43%,#ffffff_45%,#f0f0f8_47%,#d4d4e6_53%,#bcbcd0_62%,#d0d0e2_72%,#e8e8f4_80%,#c8c8dc_100%)]">
          <div className="flex h-full min-h-0">
            <aside
              className={`border-r border-black/12 bg-black/[0.04] p-4 transition-all duration-300 ${
                sidebarOpen ? 'w-[280px] opacity-100' : 'w-0 opacity-0 p-0 border-r-0 overflow-hidden'
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <p className="text-[10px] f1-m uppercase tracking-widest text-black/45">Conversations</p>
              </div>
              <div className="space-y-2 overflow-y-auto max-h-[calc(100vh-13rem)] pr-1">
                {threads.map((thread) => (
                  <button
                    key={thread.id}
                    onClick={() => setActiveInsightChatThread(programId, thread.id)}
                    className={`w-full text-left rounded-sm border px-3 py-2 transition-colors ${
                      thread.id === activeThread?.id
                        ? 'bg-black text-white border-black'
                        : 'bg-white/45 border-black/12 hover:bg-white/70'
                    }`}
                  >
                    <p className="text-[10px] f1-m uppercase tracking-widest truncate">{thread.title || 'New Chat'}</p>
                    <p className={`text-[9px] f1-m mt-1 ${thread.id === activeThread?.id ? 'text-white/70' : 'text-black/45'}`}>
                      {new Date(thread.updatedAt).toLocaleString()}
                    </p>
                  </button>
                ))}
              </div>
            </aside>

            <div className="flex-1 flex flex-col h-full min-h-0 bg-gradient-to-b from-white/10 to-white/5">
              <div className="border-b border-black/10 px-5 py-4 md:px-6 md:py-5 bg-black/[0.02] flex items-center justify-between">
                <div>
                  <p className="text-[10px] f1-m uppercase tracking-widest text-black/45">
                    Long-form follow-up workspace
                  </p>
                  <p className="text-[9px] f1-m uppercase tracking-widest text-black/35 mt-1">
                    Chat mode with preserved context
                  </p>
                </div>
                {!sidebarOpen && (
                  <button
                    onClick={() => setSidebarOpen(true)}
                    className="text-[10px] f1-m uppercase tracking-widest border border-black/15 rounded-md px-2 py-1 hover:bg-black/[0.05]"
                  >
                    Open Chats
                  </button>
                )}
              </div>

              <div ref={listRef} className="space-y-4 flex-1 overflow-y-auto px-4 py-5 md:px-5 min-h-0">
                {chatMessages.length === 0 && (
                  <div className="rounded-sm border border-black/10 bg-black/[0.03] p-4 text-xs f1-m text-black/50">
                    Ask why users churn, where the funnel leaks, or what to ship this week. Tables, markdown and math are supported.
                  </div>
                )}
                {chatMessages.map((message, idx) => (
                  <div key={`${message.role}-${idx}`} className={`flex items-start gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    {message.role !== 'user' && (
                      <div className="w-7 h-7 rounded-sm border border-black/15 bg-white/50 flex items-center justify-center text-[9px] f1-h font-bold text-black/65 shrink-0 mt-1">
                        AI
                      </div>
                    )}
                    <div className={`w-full max-w-[72%] rounded-xl border px-4 py-3 shadow-[0_2px_8px_rgba(0,0,0,0.08)] ${
                      message.role === 'user'
                        ? 'bg-black text-white border-black/80'
                        : 'bg-white/55 border-black/10 text-black/70'
                    }`}>
                      <p className="text-[9px] f1-m uppercase tracking-widest opacity-60 mb-2">
                        {message.role === 'user' ? 'You' : 'Pulse AI'}
                      </p>
                      {message.role === 'user' ? (
                        <p className="text-sm f1-m leading-relaxed">{message.content}</p>
                      ) : (
                        <FormattedMessage content={message.content} />
                      )}
                    </div>
                    {message.role === 'user' && (
                      <div className="w-7 h-7 rounded-sm border border-black/20 bg-black text-white flex items-center justify-center text-[9px] f1-h font-bold shrink-0 mt-1">
                        YOU
                      </div>
                    )}
                  </div>
                ))}
                {chatLoading && (
                  <div className="flex items-start gap-3 p-2">
                    <div className="w-7 h-7 rounded-sm border border-black/15 bg-white/50 flex items-center justify-center text-[9px] f1-h font-bold text-black/65 shrink-0 mt-1">
                      AI
                    </div>
                    <div className="rounded-xl border border-black/10 bg-white/50 px-4 py-3">
                      <div className="flex gap-1">
                        <span className="w-2 h-2 bg-black/40 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-2 h-2 bg-black/40 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-2 h-2 bg-black/40 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {visibleSuggestions.length > 0 && (
                <div className="px-4 pb-4 md:px-5 border-t border-black/10 pt-4 flex flex-wrap gap-2 bg-black/[0.015]">
                  {visibleSuggestions.map((suggestion) => (
                    <button
                      key={suggestion}
                      onClick={() => void sendFollowup(suggestion)}
                      disabled={chatLoading}
                      className="px-3 py-2 rounded-lg border border-black/10 bg-black/[0.03] hover:bg-black/[0.06] text-[10px] f1-m uppercase tracking-widest text-black/60 hover:text-black transition-colors disabled:opacity-50"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              )}

              <form
                className="sticky bottom-0 m-0 border-t border-black/10 bg-[rgba(245,245,252,0.92)] backdrop-blur-sm px-4 py-4 md:px-5 flex flex-col sm:flex-row gap-3"
                onSubmit={(e) => {
                  e.preventDefault()
                  void sendFollowup()
                }}
              >
                <input
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Type your follow-up question..."
                  className="flex-1 px-4 py-3 rounded-xl border border-black/15 bg-white/70 text-sm f1-m text-black/80 placeholder:text-black/35 focus:outline-none focus:border-black/35"
                  disabled={chatLoading}
                />
                <button
                  type="submit"
                  disabled={chatLoading || !chatInput.trim()}
                  className="btn-hero text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <span className="btn-label">Send</span>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </button>
              </form>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}
