create table if not exists public.ai_chat_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  game_id text not null,
  user_name text not null,
  assistant_message_id text not null,
  conversation_details jsonb not null default '{}'::jsonb,
  actions_performed jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists idx_ai_chat_conversations_assistant_message_id
  on public.ai_chat_conversations (assistant_message_id);

create index if not exists idx_ai_chat_conversations_user_created_at
  on public.ai_chat_conversations (user_id, created_at desc);

create index if not exists idx_ai_chat_conversations_game_created_at
  on public.ai_chat_conversations (game_id, created_at desc);

alter table public.ai_chat_conversations enable row level security;

drop policy if exists "ai_chat_conversations_select_own" on public.ai_chat_conversations;
create policy "ai_chat_conversations_select_own"
on public.ai_chat_conversations
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "ai_chat_conversations_insert_own" on public.ai_chat_conversations;
create policy "ai_chat_conversations_insert_own"
on public.ai_chat_conversations
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "ai_chat_conversations_update_own" on public.ai_chat_conversations;
create policy "ai_chat_conversations_update_own"
on public.ai_chat_conversations
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create or replace function public.set_ai_chat_conversations_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_ai_chat_conversations_updated_at on public.ai_chat_conversations;
create trigger trg_ai_chat_conversations_updated_at
before update on public.ai_chat_conversations
for each row
execute function public.set_ai_chat_conversations_updated_at();
