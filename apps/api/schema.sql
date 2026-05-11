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

-- Linked Wallets (Secondary wallets proving ownership)
create table linked_wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  wallet_pubkey text not null unique,
  label text,
  created_at timestamptz default now()
);

-- Prevent linking a primary wallet as a secondary wallet
create or replace function check_linked_wallet_not_primary()
returns trigger as $$
begin
  if exists (select 1 from users where wallet_pubkey = new.wallet_pubkey) then
    raise exception 'Wallet is already a primary account';
  end if;
  return new;
end;
$$ language plpgsql;

create trigger tr_linked_wallets_not_primary
  before insert or update on linked_wallets
  for each row execute function check_linked_wallet_not_primary();

-- Prevent creating a primary wallet if it's already a linked wallet
create or replace function check_primary_wallet_not_linked()
returns trigger as $$
begin
  if exists (select 1 from linked_wallets where wallet_pubkey = new.wallet_pubkey) then
    raise exception 'Wallet is already a linked account';
  end if;
  return new;
end;
$$ language plpgsql;

create trigger tr_users_not_linked
  before insert or update on users
  for each row execute function check_primary_wallet_not_linked();

-- Max 5 linked wallets per user
create or replace function check_linked_wallets_limit()
returns trigger as $$
begin
  if (select count(*) from linked_wallets where user_id = new.user_id) >= 5 then
    raise exception 'Maximum 5 linked wallets allowed per user';
  end if;
  return new;
end;
$$ language plpgsql;

create trigger tr_linked_wallets_limit
  before insert on linked_wallets
  for each row execute function check_linked_wallets_limit();

-- Audit Log for Wallet Linking
create table wallet_audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  action text not null check (action in ('link', 'unlink')),
  wallet_pubkey text not null,
  ip_address text,
  user_agent text,
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
  last_synced_signature text,               -- Cursor for incremental sync
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
alter table linked_wallets enable row level security;
alter table wallet_audit_log enable row level security;
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

-- Linked Wallets: users can read/delete their own
create policy "Users can read own linked wallets" on linked_wallets
  for select using (user_id = auth.uid());
create policy "Users can delete own linked wallets" on linked_wallets
  for delete using (user_id = auth.uid());

-- Audit log: users can read their own
create policy "Users can read own wallet audit logs" on wallet_audit_log
  for select using (user_id = auth.uid());

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
-- INSIGHT REPORTS — Historical AI insight snapshots
-- =============================================================
create table if not exists insight_reports (
  id uuid primary key default gen_random_uuid(),
  program_id uuid references programs(id) on delete cascade not null,
  generated_at timestamptz default now() not null,
  health_score integer,
  headline text,
  full_json jsonb not null,
  unique(program_id, generated_at)
);
create index if not exists idx_insight_reports_program
  on insight_reports(program_id, generated_at desc);

alter table insight_reports enable row level security;
create policy "Users can read own insight reports" on insight_reports
  for select using (
    program_id in (select id from programs where user_id = auth.uid())
  );

-- =============================================================
-- FOLLOW-UP CHAT PERSISTENCE (per user + program)
-- =============================================================
create table if not exists insight_chat_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade not null,
  program_id uuid references programs(id) on delete cascade not null,
  title text not null default 'New Chat',
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create table if not exists insight_chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid references insight_chat_threads(id) on delete cascade not null,
  role text not null check (role in ('user', 'ai')),
  content text not null,
  created_at timestamptz default now() not null
);

create index if not exists idx_insight_chat_threads_user_program
  on insight_chat_threads(user_id, program_id, updated_at desc);
create index if not exists idx_insight_chat_messages_thread_created
  on insight_chat_messages(thread_id, created_at asc);

alter table insight_chat_threads enable row level security;
alter table insight_chat_messages enable row level security;

create policy "Users can read own chat threads" on insight_chat_threads
  for select using (user_id = auth.uid());

create policy "Users can read own chat messages" on insight_chat_messages
  for select using (
    thread_id in (select id from insight_chat_threads where user_id = auth.uid())
  );

-- =============================================================
-- SERVICE ROLE BYPASS (for backend API operations)
-- The FastAPI backend uses the service role key which bypasses RLS.
-- This is by design — the backend validates auth via JWT middleware.
-- =============================================================
