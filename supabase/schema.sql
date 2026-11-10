-- R&F Triage: database setup.
-- Run once in the Supabase SQL editor. Safe to re-run: it only creates what is missing.
--
-- Sign-in model: every client has ONE shared login (client code + password), and Kevin has an
-- admin login. Each login is a Supabase auth user whose email is <code>@triage.rhyneandfriends.com
-- (never used for mail). `members` ties a login to a client and a role. Names typed at sign-in
-- are stored as plain text on comments, requests and activity (honor system).

-- ---------- tables ----------

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,                    -- what people type to sign in, e.g. ACME
  name text not null,                           -- shown in the sidebar
  plan text not null default 'Retainer',        -- e.g. "Medium Retainer"
  default_capacity int not null default 20 check (default_capacity > 0),
  created_at timestamptz not null default now()
);

create table if not exists public.members (
  user_id uuid primary key references auth.users on delete cascade,
  client_id uuid references public.clients on delete cascade, -- null for admin
  role text not null check (role in ('client', 'admin')),
  check (role = 'admin' or client_id is not null)
);

create table if not exists public.months (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients on delete cascade,
  starts_on date not null,                      -- first day of the month
  capacity int not null check (capacity > 0),
  unique (client_id, starts_on)
);

create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients on delete cascade,
  type text not null check (type in ('Bug', 'Feature')),
  points int check (points > 0),               -- null = not estimated yet
  title text not null,
  description text not null default '',
  status text not null default 'Planned' check (status in ('Planned', 'Shipped')),
  month_id uuid references public.months on delete set null, -- null = backlog
  position double precision not null default 0, -- order within its month or the backlog
  created_at timestamptz not null default now()
);

create table if not exists public.requests (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients on delete cascade,
  type text not null check (type in ('Bug', 'Feature')),
  title text not null,
  description text not null default '',
  status text not null default 'pending' check (status in ('pending', 'declined')),
  author_name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients on delete cascade,
  item_id uuid references public.items on delete cascade,
  request_id uuid references public.requests on delete cascade,
  author_name text not null,
  body text not null,
  created_at timestamptz not null default now(),
  check (item_id is not null or request_id is not null)
);

create table if not exists public.activity (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients on delete cascade,
  item_id uuid references public.items on delete set null,
  actor_name text not null,
  text text not null,
  created_at timestamptz not null default now()
);

create index if not exists items_client_idx on public.items (client_id);
create index if not exists requests_client_idx on public.requests (client_id);
create index if not exists comments_item_idx on public.comments (item_id);
create index if not exists comments_request_idx on public.comments (request_id);

-- ---------- who is signed in ----------

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from members where user_id = auth.uid() and role = 'admin');
$$;

create or replace function public.my_client_id() returns uuid
language sql stable security definer set search_path = public as $$
  select client_id from members where user_id = auth.uid();
$$;

-- Row is visible/editable if you're the admin or it belongs to your client.
create or replace function public.can_access(row_client uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or row_client = public.my_client_id();
$$;

-- ---------- row level security ----------

alter table public.clients  enable row level security;
alter table public.members  enable row level security;
alter table public.months   enable row level security;
alter table public.items    enable row level security;
alter table public.requests enable row level security;
alter table public.comments enable row level security;
alter table public.activity enable row level security;

-- Drop and recreate policies so re-running stays in sync.
do $$ declare p record; begin
  for p in select policyname, tablename from pg_policies
           where schemaname = 'public' and tablename in ('clients','members','months','items','requests','comments','activity')
  loop execute format('drop policy %I on public.%I', p.policyname, p.tablename); end loop;
end $$;

-- clients: read your own; admin manages all
create policy clients_read  on public.clients for select using (public.can_access(id));
create policy clients_admin on public.clients for all using (public.is_admin()) with check (public.is_admin());

-- members: read your own row; admin manages all
create policy members_read  on public.members for select using (user_id = auth.uid() or public.is_admin());
create policy members_admin on public.members for all using (public.is_admin()) with check (public.is_admin());

-- months: clients read; admin manages (clients get months via ensure_months below)
create policy months_read  on public.months for select using (public.can_access(client_id));
create policy months_admin on public.months for all using (public.is_admin()) with check (public.is_admin());

-- items: clients read and reorder (update); only admin creates or deletes
create policy items_read   on public.items for select using (public.can_access(client_id));
create policy items_update on public.items for update using (public.can_access(client_id)) with check (public.can_access(client_id));
create policy items_admin  on public.items for all using (public.is_admin()) with check (public.is_admin());

-- requests, comments, activity: anyone on the client can read and write their own client's rows
create policy requests_all on public.requests for all using (public.can_access(client_id)) with check (public.can_access(client_id));
create policy comments_all on public.comments for all using (public.can_access(client_id)) with check (public.can_access(client_id));
create policy activity_all on public.activity for all using (public.can_access(client_id)) with check (public.can_access(client_id));

-- ---------- what clients may change ----------
-- Clients may only move items (month_id, position). Everything else is Kevin's.
create or replace function public.guard_item_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() and (
    new.client_id is distinct from old.client_id or
    new.type is distinct from old.type or
    new.points is distinct from old.points or
    new.title is distinct from old.title or
    new.description is distinct from old.description or
    new.status is distinct from old.status
  ) then
    raise exception 'Only Kevin can edit items';
  end if;
  return new;
end $$;

drop trigger if exists guard_item_update on public.items;
create trigger guard_item_update before update on public.items
  for each row execute function public.guard_item_update();

-- Clients can't decline their own requests.
create or replace function public.guard_request_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() and new.status is distinct from old.status then
    raise exception 'Only Kevin can decline requests';
  end if;
  return new;
end $$;

drop trigger if exists guard_request_update on public.requests;
create trigger guard_request_update before update on public.requests
  for each row execute function public.guard_request_update();

-- ---------- months ----------
-- Makes sure this month and the next two exist for a client. Called by the app on load.
create or replace function public.ensure_months(target_client uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  month_start date := date_trunc('month', now() at time zone 'America/Los_Angeles')::date;
  cap int;
begin
  if not public.can_access(target_client) then
    raise exception 'Not allowed';
  end if;
  select default_capacity into cap from clients where id = target_client;
  insert into months (client_id, starts_on, capacity)
  select target_client, (month_start + (n || ' month')::interval)::date, cap
  from generate_series(0, 2) as n
  on conflict (client_id, starts_on) do nothing;
end $$;

-- ---------- api access ----------
-- New tables aren't exposed automatically, so grant explicitly. Signed-in users only.
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on function public.ensure_months(uuid) to authenticated;
revoke all on all tables in schema public from anon;
