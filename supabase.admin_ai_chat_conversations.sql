create or replace function public.get_admin_ai_chat_conversations(
  limit_count integer default 100,
  target_user_ids uuid[] default null
)
returns table(
  id uuid,
  user_id uuid,
  game_id text,
  user_name text,
  assistant_message_id text,
  conversation_details jsonb,
  actions_performed jsonb,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
as $$
begin
  if (auth.jwt() ->> 'email') is distinct from 'carterwarrenhurst@gmail.com' then
    raise exception 'Not authorized to view admin AI chat conversations';
  end if;

  return query
  select
    c.id,
    c.user_id,
    c.game_id,
    c.user_name,
    c.assistant_message_id,
    c.conversation_details,
    c.actions_performed,
    c.created_at,
    c.updated_at
  from public.ai_chat_conversations c
  where (target_user_ids is null or c.user_id = any(target_user_ids))
  order by c.created_at desc, c.id desc
  limit nullif(greatest(coalesce(limit_count, 0), 0), 0);
end;
$$;

grant execute on function public.get_admin_ai_chat_conversations(integer, uuid[]) to authenticated;
