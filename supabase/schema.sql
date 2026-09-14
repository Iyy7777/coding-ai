-- Run this once in your Supabase project's SQL Editor
-- (Dashboard > SQL Editor > New query > paste this > Run).
--
-- Creates the chats/messages tables and Row Level Security (RLS) policies
-- so each signed-in user can only see and modify their own data.

-- ---------- Tables ----------
create table if not exists public.chats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'New chat',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.chats(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists messages_chat_id_idx on public.messages (chat_id, created_at);
create index if not exists chats_user_id_idx on public.chats (user_id, updated_at desc);

-- ---------- Row Level Security ----------
alter table public.chats enable row level security;
alter table public.messages enable row level security;

-- Chats: a user can only see/insert/update/delete their own chats.
drop policy if exists "chats_select_own" on public.chats;
create policy "chats_select_own" on public.chats
  for select using (auth.uid() = user_id);

drop policy if exists "chats_insert_own" on public.chats;
create policy "chats_insert_own" on public.chats
  for insert with check (auth.uid() = user_id);

drop policy if exists "chats_update_own" on public.chats;
create policy "chats_update_own" on public.chats
  for update using (auth.uid() = user_id);

drop policy if exists "chats_delete_own" on public.chats;
create policy "chats_delete_own" on public.chats
  for delete using (auth.uid() = user_id);

-- Messages: a user can only see/insert messages that belong to one of THEIR chats.
drop policy if exists "messages_select_own" on public.messages;
create policy "messages_select_own" on public.messages
  for select using (
    exists (select 1 from public.chats c where c.id = messages.chat_id and c.user_id = auth.uid())
  );

drop policy if exists "messages_insert_own" on public.messages;
create policy "messages_insert_own" on public.messages
  for insert with check (
    exists (select 1 from public.chats c where c.id = messages.chat_id and c.user_id = auth.uid())
  );

drop policy if exists "messages_delete_own" on public.messages;
create policy "messages_delete_own" on public.messages
  for delete using (
    exists (select 1 from public.chats c where c.id = messages.chat_id and c.user_id = auth.uid())
  );
