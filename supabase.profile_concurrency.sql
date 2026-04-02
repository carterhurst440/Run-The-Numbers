alter table public.profiles
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

update public.profiles
set updated_at = timezone('utc', now())
where updated_at is null;

create or replace function public.set_profile_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists set_profiles_updated_at on public.profiles;

create trigger set_profiles_updated_at
before update on public.profiles
for each row
execute function public.set_profile_updated_at();
