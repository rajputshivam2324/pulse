-- =============================================================
-- Pulse — Supabase Schema
-- AI-Powered Product Analytics for Solana Founders
-- =============================================================

-- Users (keyed by Solana wallet pubkey — no email)
create table users (
  id uuid primary key default gen_random_uuid(),
  wallet_pubkey text unique not null,
  plan text not null default 'free',         -- 'free' | 'team' | 'protocol'
  plan_expires_at timestamptz,
  subscription_pubkey text,                  -- on-chain Anchor account address
  created_at timestamptz default now()
);

-- Programs registered by users
create table programs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  program_address text not null,
  name text,
  network text default 'mainnet',
  helius_webhook_id text,                    -- Helius webhook registration ID
  created_at timestamptz default now(),
  last_synced_at timestamptz,
  unique(user_id, program_address)
);

-- Normalized transactions (append-only, source of truth)
create table transactions (
  id uuid primary key default gen_random_uuid(),
  program_id uuid references programs(id) on delete cascade,
  signature text unique not null,
  wallet_address text not null,
  transaction_type text,
  timestamp timestamptz not null,
  fee_lamports bigint,
  amount_sol numeric,
  amount_token numeric,
  token_mint text,
  created_at timestamptz default now()
);

-- Precomputed daily metrics
create table metrics_daily (
  id uuid primary key default gen_random_uuid(),
  program_id uuid references programs(id) on delete cascade,
  date date not null,
  daw integer,
  new_wallets integer,
  returning_wallets integer,
  total_transactions integer,
  total_volume_sol numeric,
  unique(program_id, date)
);

-- Weekly retention cohorts
create table retention_cohorts (
  id uuid primary key default gen_random_uuid(),
  program_id uuid references programs(id) on delete cascade,
  cohort_week date not null,
  week_number integer not null,
  wallet_count integer,
  retention_rate numeric,
  unique(program_id, cohort_week, week_number)
);

-- AI generated insights (LangGraph output stored here)
create table insights (
  id uuid primary key default gen_random_uuid(),
  program_id uuid references programs(id) on delete cascade,
  generated_at timestamptz default now(),
  headline text,
  biggest_problem text,
  health_score integer,
  insights_json jsonb,
  quick_wins jsonb,
  retention_diagnosis jsonb,
  metrics_snapshot jsonb,
  graph_execution_trace jsonb             -- LangGraph node execution log
);

-- On-chain payment records
create table payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id),
  tx_signature text unique not null,
  amount_usdc numeric,
  plan text,
  paid_at timestamptz default now()
);

-- =============================================================
-- INDEXES
-- =============================================================

create index idx_transactions_program_id on transactions(program_id);
create index idx_transactions_wallet on transactions(wallet_address);
create index idx_transactions_timestamp on transactions(timestamp);
create index idx_transactions_program_wallet on transactions(program_id, wallet_address);
create index idx_metrics_daily_program_date on metrics_daily(program_id, date);
create index idx_retention_program_cohort on retention_cohorts(program_id, cohort_week);
create index idx_insights_program on insights(program_id);
create index idx_programs_user on programs(user_id);
create index idx_payments_user on payments(user_id);

-- =============================================================
-- ROW LEVEL SECURITY
-- =============================================================

alter table users enable row level security;
alter table programs enable row level security;
alter table transactions enable row level security;
alter table metrics_daily enable row level security;
alter table retention_cohorts enable row level security;
alter table insights enable row level security;
alter table payments enable row level security;

-- Users can only read/update their own row
create policy "Users can read own data" on users
  for select using (auth.uid() = id);
create policy "Users can update own data" on users
  for update using (auth.uid() = id);

-- Programs: users can CRUD their own programs
create policy "Users can read own programs" on programs
  for select using (user_id = auth.uid());
create policy "Users can insert own programs" on programs
  for insert with check (user_id = auth.uid());
create policy "Users can delete own programs" on programs
  for delete using (user_id = auth.uid());

-- Transactions: users can read transactions for their programs
create policy "Users can read own transactions" on transactions
  for select using (
    program_id in (select id from programs where user_id = auth.uid())
  );

-- Metrics: users can read metrics for their programs
create policy "Users can read own metrics" on metrics_daily
  for select using (
    program_id in (select id from programs where user_id = auth.uid())
  );

-- Retention: users can read retention for their programs
create policy "Users can read own retention" on retention_cohorts
  for select using (
    program_id in (select id from programs where user_id = auth.uid())
  );

-- Insights: users can read insights for their programs
create policy "Users can read own insights" on insights
  for select using (
    program_id in (select id from programs where user_id = auth.uid())
  );

-- Payments: users can read own payments
create policy "Users can read own payments" on payments
  for select using (user_id = auth.uid());

-- =============================================================
-- SERVICE ROLE BYPASS (for backend API operations)
-- The FastAPI backend uses the service role key which bypasses RLS.
-- This is by design — the backend validates auth via JWT middleware.
-- =============================================================
