# AI Insights Page Redesign — 2-Phase Implementation Plan

Transform insights from "3 text cards side by side" → evidence-backed analytics tool with inline charts, comparison tables, and contextual AI chat.

---

## Current State

[insights/page.tsx](file:///home/shivam/pulse/apps/web/src/app/(dashboard)/dashboard/[programId]/insights/page.tsx) — 340 lines:
- 3-column grid of anomaly cards (newspaper layout)
- Each card: severity badge + finding text + recommendation text
- No inline charts, no evidence, no follow-up questions
- Health score as separate card with ring visualization
- Quick wins as bullet list
- No insight history, no chat

Data already available but unused on insights page:
- `per_type_retention` — computed in [metrics.py:193-231](file:///home/shivam/pulse/apps/api/services/metrics.py#L193-L231), never shown on insights
- `funnel` — exists in metrics, could be inlined in anomaly cards
- `retention_cohorts` — exists, could be inlined
- `activity_heatmap` — exists, could be inlined

Chart components already built in [Charts.tsx](file:///home/shivam/pulse/apps/web/src/components/dashboard/Charts.tsx):
- `FunnelChart`, `RetentionGrid`, `HealthScore`, `DAWChart` — all reusable

---

## Phase 1 — Frontend Redesign + Insight Storage

> Goal: Make existing AI output scannable and evidence-backed. No new API endpoints except insight storage.

### Component 1: Header Bar (replaces headline card)

#### [MODIFY] [page.tsx](file:///home/shivam/pulse/apps/web/src/app/(dashboard)/dashboard/[programId]/insights/page.tsx)

Replace the current 2/3 + 1/3 grid (lines 205-246) with single-row header bar:

```
┌──────────────────────────────────────────────────────────────────────┐
│ "72% of wallets never return after first OPEN_POSITION"  │ 34/F │ ↻ │
│                                                          │ score│regen│
└──────────────────────────────────────────────────────────────────────┘
```

- Headline text: `insights.headline` (one line, truncated)
- Health score: number + grade letter (A/B/C/D/F) — reuse grade logic from [Charts.tsx:46](file:///home/shivam/pulse/apps/web/src/components/dashboard/Charts.tsx#L46)
- Generated timestamp: `new Date().toLocaleString()` stored in Zustand
- Regenerate button: calls existing `handleGenerateInsights()`

---

### Component 2: Full-Width Anomaly Cards

#### [MODIFY] [page.tsx](file:///home/shivam/pulse/apps/web/src/app/(dashboard)/dashboard/[programId]/insights/page.tsx)

Replace 3-column grid (lines 248-288) with full-width stacked cards. Each card = 3 vertical zones:

**Zone 1 — Claim:**
```
┌─────────────────────────────────────────────────────────────┐
│ 🔴 CRITICAL  │  72% of wallets never return after first    │
│              │  OPEN_POSITION transaction                   │
└─────────────────────────────────────────────────────────────┘
```
- Severity badge (color-coded, existing `SEVERITY_CONFIG`)
- Finding text: `insight.finding` — sentence case, NOT uppercase

**Zone 2 — Evidence (NEW):**
```
┌──────────────────────────┬──────────────────────────────────┐
│ Retention by First Action│ Transaction Funnel               │
│ ┌─────────────────────┐  │ ┌──────────────────────────────┐ │
│ │ WITHDRAW      100%  │  │ │ Step 1: 233 wallets          │ │
│ │ OPEN_POS        0%  │  │ │ Step 2: 65 (-72%)            │ │
│ │ BURN           50%  │  │ │ Step 3: 23 (-65%)            │ │
│ └─────────────────────┘  │ └──────────────────────────────┘ │
└──────────────────────────┴──────────────────────────────────┘
```
- **Key insight**: these aren't new API calls. Metrics data already in Zustand store (`metricsByProgram[programId]`). Import from store, render inline.
- **⚠️ Guard**: If user navigates directly to `/insights` without visiting dashboard first, store may be empty. Add `useEffect` that fetches metrics from `GET /analytics/metrics/{programId}` if `metricsByProgram[programId]` is undefined.
- Use mini versions of existing `FunnelChart` and a new `RetentionByTypeBar` component
- Match chart to anomaly: if anomaly references "retention", show per-type retention. If references "funnel", show funnel. If references "DAW", show DAW trend.

**Zone 3 — Actions + Follow-up Chips:**
```
┌─────────────────────────────────────────────────────────────┐
│ ⚡ Add a return incentive after first OPEN_POSITION         │
│                                                             │
│ 💬 "Why does WITHDRAW retain?"  "What do returners do?"    │
└─────────────────────────────────────────────────────────────┘
```
- Action: existing `insight.recommendation`
- Chips: generated from anomaly context. Phase 1 = hardcoded patterns based on `insight.metric_reference`. Phase 2 = AI-generated.
- Chips are clickable → scroll to follow-up chat (Phase 2) or show placeholder "Chat coming soon"

---

### Component 3: Transaction Type Comparison Table (NEW)

#### [NEW] `RetentionByTypeTable` component in [Charts.tsx](file:///home/shivam/pulse/apps/web/src/components/dashboard/Charts.tsx)

Data source: `per_type_retention` from metrics (already computed by [metrics.py:193-231](file:///home/shivam/pulse/apps/api/services/metrics.py#L193-L231)) + `drop_off_by_type` from [metrics.py:157-190](file:///home/shivam/pulse/apps/api/services/metrics.py#L157-L190).

```
┌──────────────┬───────┬───────────┬───────────┬──────────┬───────────┐
│ Action Type  │ Users │ D7 Ret.   │ D30 Ret.  │ Avg Txns │ vs Bench  │
├──────────────┼───────┼───────────┼───────────┼──────────┼───────────┤
│ WITHDRAW     │   4   │ 🟢 100%  │ 🟢 100%  │   3.2    │ +75%      │
│ BURN         │   8   │ 🟡  50%  │ 🟡  25%  │   1.8    │ +5%       │
│ OPEN_POSITION│ 145   │ 🔴   0%  │ 🔴   0%  │   1.0    │ -45%      │
│ TRANSFER     │  76   │ 🔴   0%  │ 🔴   0%  │   1.0    │ -45%      │
└──────────────┴───────┴───────────┴───────────┴──────────┴───────────┘
```

Color coding cells:
- `🔴` red: 0-10% retention
- `🟡` amber: 10-30%
- `🟢` green: 30%+

Benchmark column: compare against Solana DeFi average (hardcoded: D7=25%, D30=10% for now)

Data merge logic:
```typescript
// Combine per_type_retention + drop_off_by_type from metrics store
const metrics = metricsByProgram[programId]
const perType = metrics?.perTypeRetention || metrics?.per_type_retention || []
// Each row: { type, total_wallets, returned_wallets, return_rate }
```

---

### Component 4: Quick Wins as Impact Cards

#### [MODIFY] [page.tsx](file:///home/shivam/pulse/apps/web/src/app/(dashboard)/dashboard/[programId]/insights/page.tsx)

Replace bullet list (lines 317-333) with 3 impact cards in a row:

```
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│     +233          │ │     +45%          │ │     2x            │
│ wallets if 10%    │ │ D7 retention if   │ │ DAW if fix        │
│ convert on return │ │ fix OPEN_POSITION │ │ step 1→2          │
│                   │ │                   │ │                   │
│ 🏷️ 1 day effort  │ │ 🏷️ 1 week effort │ │ 🏷️ 1 day effort  │
└──────────────────┘ └──────────────────┘ └──────────────────┘
```

Impact numbers: derive from metrics context:
- `oneAndDone * 0.1` = potential wallet recovery
- Retention improvement = current rate vs benchmark gap
- Effort tags: hardcoded Phase 1, AI-generated Phase 2

---

### Component 5: Insight History Storage + Display

#### [NEW] SQL migration — add `insight_reports` table

```sql
CREATE TABLE insight_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid REFERENCES programs(id) ON DELETE CASCADE,
  generated_at timestamptz DEFAULT now(),
  health_score integer,
  headline text,
  full_json jsonb NOT NULL,
  UNIQUE(program_id, generated_at)
);
CREATE INDEX idx_insight_reports_program ON insight_reports(program_id, generated_at DESC);
```

> **⚠️ Row limit (Risk 2 fix)**: Keep max 10 reports per program. After inserting, delete oldest:
> ```python
> # After insert, prune old reports
> supabase.rpc("prune_insight_reports", {"p_program_id": program_db_id, "p_keep": 10}).execute()
> ```
> Or simpler: just delete in Python after insert (see insights.py modification below).

#### [MODIFY] [insights.py](file:///home/shivam/pulse/apps/api/routers/insights.py)

After line 136 (cache set), add Supabase insert:

```python
# Persist insight report for history
try:
    supabase.table("insight_reports").insert({
        "program_id": program_row.data[0]["id"],
        "health_score": output["health_score"],
        "headline": output["headline"],
        "full_json": output,
    }).execute()
except Exception as e:
    logger.warning("Failed to persist insight report", extra={"error": str(e)})
```

#### [NEW] API endpoint — `GET /insights/history/{program_id}`

Add to [insights.py](file:///home/shivam/pulse/apps/api/routers/insights.py):

```python
@router.get("/history/{program_id}")
async def get_insight_history(program_id: str, wallet: str = Depends(require_auth)):
    """Get previous insight reports for trend comparison."""
    # ownership check...
    supabase = get_supabase()
    result = supabase.table("insight_reports") \
        .select("generated_at, health_score, headline") \
        .eq("program_id", db_program_id) \
        .order("generated_at", desc=True) \
        .limit(10) \
        .execute()
    return {"reports": result.data or []}
```

#### [MODIFY] [page.tsx](file:///home/shivam/pulse/apps/web/src/app/(dashboard)/dashboard/[programId]/insights/page.tsx)

Add collapsed "Previous Reports" row at top:

```
┌─────────────────────────────────────────────────────────────┐
│ ▸ Previous Reports  │  Score: 34 → 41 → 34  │  3 reports   │
└─────────────────────────────────────────────────────────────┘
```

Shows health score trend sparkline. Expandable to see past headlines + timestamps.

---

### Phase 1 File Summary

| Action | File | Description |
|--------|------|-------------|
| **MODIFY** | `apps/web/src/app/(dashboard)/dashboard/[programId]/insights/page.tsx` | Full rewrite: header bar, stacked anomaly cards with evidence zones, impact quick wins, history row |
| **MODIFY** | `apps/web/src/components/dashboard/Charts.tsx` | Add `RetentionByTypeTable`, `RetentionByTypeBar` (mini), `ImpactCard` components |
| **MODIFY** | `apps/api/routers/insights.py` | Add insight report persistence + `/insights/history/{program_id}` endpoint |
| **NEW** | SQL migration for `insight_reports` table | Schema addition |

**Estimated effort: 2-3 days**

---

## Phase 2 — Follow-Up Chat + AI-Generated Suggestions

> Goal: Make insights interactive. User asks follow-up questions scoped to program data. AI answers with real numbers.

### Component 6: Follow-Up Chat Endpoint

#### [NEW] API endpoint — `POST /insights/followup`

Add to [insights.py](file:///home/shivam/pulse/apps/api/routers/insights.py):

```python
@router.post("/followup/{program_id}")
@limiter.limit("20/hour")
async def followup_question(
    request: Request,
    program_id: str,
    wallet: str = Depends(require_auth),
):
    """
    Answer a follow-up question about a program's metrics.
    Receives: { question: str }
    Uses full metrics context as system prompt injection.
    Returns: { answer: str, suggested_followups: list[str] }
    """
    # ⚠️ PLAN GATE — same check as /generate (Risk 3 fix)
    has_access = await _check_plan_feature(wallet, "ai_insights")
    if not has_access:
        raise HTTPException(
            status_code=403,
            detail="AI follow-up requires a Team or Protocol plan.",
        )

    # Ownership check
    supabase = get_supabase()
    user_id = resolve_wallet_to_user_id(wallet)
    if not user_id:
        raise HTTPException(status_code=401, detail="User not found.")
    program_row = supabase.table("programs").select("id, user_id") \
        .eq("program_address", program_id).eq("user_id", user_id).execute()
    if not program_row.data:
        raise HTTPException(status_code=403, detail="You do not own this program.")

    body = await request.json()
    question = body.get("question", "")
    
    # Get metrics context (same data LangGraph pipeline uses)
    metrics = await cache_get(metrics_cache_key(program_id))
    if not metrics:
        raise HTTPException(status_code=404, detail="No metrics. Sync first.")
    
    # Get latest insights for additional context
    insights = await cache_get(insights_cache_key(program_id))
    
    # Build contextual prompt
    from services.ai.followup import answer_followup
    result = await answer_followup(
        question=question,
        metrics=metrics,
        insights=insights,
        program_name=body.get("program_name", program_id),
    )
    return result
```

#### [NEW] `services/ai/followup.py`

```python
"""
Follow-up question handler for Pulse AI.
Uses the same NVIDIA ChatNVIDIA model as the main pipeline.
Context-injected: full metrics + previous insights in system prompt.
"""

FOLLOWUP_PROMPT = ChatPromptTemplate.from_messages([
    ("system", """You are a product analytics expert for Solana programs.
You have the complete metrics data for this program. Answer questions with SPECIFIC 
NUMBERS from the data. Keep answers to 2-3 sentences. Never give generic advice.

Metrics data: {metrics_json}

Previous AI insights (if available): {insights_json}
"""),
    ("human", "{question}")
])

SUGGESTION_PROMPT = ChatPromptTemplate.from_messages([
    ("system", "Generate 3 follow-up questions a founder would want to ask based on these insights. Each question should be answerable from the metrics data. Return JSON: {\"suggestions\": [\"q1\", \"q2\", \"q3\"]}"),
    ("human", "Insights: {insights_json}\nMetrics summary: {summary_json}")
])

async def answer_followup(question, metrics, insights, program_name):
    chain = FOLLOWUP_PROMPT | _get_model()
    response = await chain.ainvoke({
        "metrics_json": json.dumps(metrics, indent=2),
        "insights_json": json.dumps(insights or {}, indent=2),
        "question": question,
    })
    return {
        "answer": response.content.strip(),
        "program_name": program_name,
    }

async def generate_suggestions(metrics, insights):
    chain = SUGGESTION_PROMPT | _get_model()
    response = await chain.ainvoke({
        "insights_json": json.dumps(insights or {}, indent=2),
        "summary_json": json.dumps(metrics.get("summary", {}), indent=2),
    })
    result = safe_parse_json(response.content)
    return result.get("suggestions", [])
```

---

### Component 7: Inline Follow-Up Chat UI

#### [MODIFY] [page.tsx](file:///home/shivam/pulse/apps/web/src/app/(dashboard)/dashboard/[programId]/insights/page.tsx)

Add chat section at bottom of insights page:

```
┌─────────────────────────────────────────────────────────────┐
│ 💬 Ask About Your Data                                      │
│                                                              │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ Why does WITHDRAW retain 100%?                            │ │
│ │                                                           │ │
│ │ WITHDRAW wallets have 3.2 avg txns vs 1.0 for            │ │
│ │ OPEN_POSITION. They demonstrate commitment via asset      │ │
│ │ extraction, suggesting these are power users who have     │ │
│ │ already engaged with staking or LP positions.             │ │
│ └──────────────────────────────────────────────────────────┘ │
│                                                              │
│ Suggestions:                                                 │
│ [Why does WITHDRAW retain?] [Fastest fix for drop-off?]     │
│ [Which wallets to re-engage?] [What does healthy look like?]│
│                                                              │
│ ┌──────────────────────────────────────┐ ┌──────┐           │
│ │ Type your question...                │ │ Send │           │
│ └──────────────────────────────────────┘ └──────┘           │
└─────────────────────────────────────────────────────────────┘
```

State management:
```typescript
const [chatMessages, setChatMessages] = useState<Array<{role: 'user'|'ai', content: string}>>([])
const [chatInput, setChatInput] = useState('')
const [chatLoading, setChatLoading] = useState(false)
const [suggestions, setSuggestions] = useState<string[]>([])
```

**⚠️ Typing indicator (feedback fix):** While `chatLoading` is true, render animated dots in an AI bubble:
```tsx
{chatLoading && (
  <div className="flex items-start gap-3 p-4">
    <div className="w-6 h-6 rounded-full bg-black/10 flex items-center justify-center">
      <span className="text-[10px]">AI</span>
    </div>
    <div className="plate px-4 py-3">
      <div className="flex gap-1">
        <span className="w-2 h-2 bg-black/40 rounded-full animate-bounce" style={{animationDelay: '0ms'}} />
        <span className="w-2 h-2 bg-black/40 rounded-full animate-bounce" style={{animationDelay: '150ms'}} />
        <span className="w-2 h-2 bg-black/40 rounded-full animate-bounce" style={{animationDelay: '300ms'}} />
      </div>
    </div>
  </div>
)}
```
Also disable Send button while loading to prevent duplicate API calls.

Chip click → fills input + auto-sends. Chips generated on insight load.

---

### Component 8: AI-Generated Question Chips

#### [MODIFY] [insights.py](file:///home/shivam/pulse/apps/api/routers/insights.py)

After insight generation, also generate suggestion chips:

```python
# In generate_insights(), after pipeline completes:
from services.ai.followup import generate_suggestions
try:
    suggested_questions = await generate_suggestions(metrics, output)
    output["suggested_questions"] = suggested_questions
except Exception:
    output["suggested_questions"] = [
        f"Why does {output.get('retention_diagnosis', {}).get('main_churn_trigger', 'the top action')} cause churn?",
        "What's the fastest fix for the step 1→2 drop-off?",
        "Which wallets are worth re-engaging?",
    ]
```

Fallback chips always generated from existing data so page never shows empty suggestions.

---

### Phase 2 File Summary

| Action | File | Description |
|--------|------|-------------|
| **NEW** | `apps/api/services/ai/followup.py` | Follow-up question handler + suggestion generator |
| **MODIFY** | `apps/api/routers/insights.py` | Add `/followup/{program_id}` endpoint + suggestion generation in `/generate` |
| **MODIFY** | `apps/web/src/app/(dashboard)/dashboard/[programId]/insights/page.tsx` | Add chat UI section + suggestion chips |
| **MODIFY** | `apps/web/src/store/index.ts` | Add chat state (messages, loading) to store |

**Estimated effort: 2-3 days**

---

## Verification Plan

### Phase 1
1. **Visual diff**: Screenshot before/after of insights page
2. **Data verification**: Confirm per_type_retention data renders correctly in comparison table
3. **History**: Generate insights twice, verify "Previous Reports" shows both with score trend
4. **Edge cases**: Test with program that has 0 insights, 1 insight, 4+ insights

### Phase 2
1. **Chat flow**: Type question → get AI response with real numbers → verify numbers match metrics
2. **Suggestion chips**: Click chip → auto-fills → sends → response appears
3. **Rate limiting**: Verify 20/hour limit on followup endpoint
4. **Context accuracy**: Ask "what's my D7 retention" → response must match actual D7 from metrics

### Both Phases
- Run locally: `npm run dev` + `python -m uvicorn main:app --reload`
- Browser test: navigate to `/dashboard/{programId}/insights`
- Verify no regressions on main dashboard page

---

## Open Questions

> [!IMPORTANT]
> **Q1**: Should follow-up chat messages persist across page refreshes? If yes, need Supabase table for chat history. If no, Zustand-only state (simpler, recommended for Phase 2).

> [!IMPORTANT]  
> **Q2**: The transaction type comparison table needs benchmark data. Options:
> - **A**: Hardcode Solana DeFi averages (D7=25%, D30=10%) — fast, opinionated
> - **B**: No benchmark column in Phase 1, add when cross-protocol data exists — safer
> 
> Recommend **A** — hardcoded benchmarks are better than no benchmarks.

> [!IMPORTANT]
> **Q3**: Phase 1 follow-up chips are pattern-based (hardcoded templates from metric_reference). Phase 2 replaces with AI-generated. Should Phase 1 chips be clickable but show "Chat coming in next update" placeholder, or should they be non-interactive?
>
> Recommend: Make them clickable, scroll to a "Coming soon" section. Builds anticipation.
