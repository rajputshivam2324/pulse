-- Historical AI insight snapshots for the Insights page.

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

drop policy if exists "Users can read own insight reports" on insight_reports;
create policy "Users can read own insight reports" on insight_reports
  for select using (
    program_id in (select id from programs where user_id = auth.uid())
  );
