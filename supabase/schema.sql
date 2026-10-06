-- Выполните в Supabase → SQL Editor
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null,
  amount numeric(12,2) not null check (amount > 0),
  type text not null check (type in ('income','expense')),
  category text not null default 'other',
  created_at timestamptz not null default now()
);

alter table public.transactions enable row level security;
create policy "read own" on public.transactions for select using (auth.uid() = user_id);
create policy "insert own" on public.transactions for insert with check (auth.uid() = user_id);
create policy "delete own" on public.transactions for delete using (auth.uid() = user_id);

alter publication supabase_realtime add table public.transactions;
