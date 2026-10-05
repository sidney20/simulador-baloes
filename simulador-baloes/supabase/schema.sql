-- ============================================================
-- Simulador de Balões — Schema Supabase (COMPLETO)
-- Como aplicar: Supabase → SQL Editor → New query → cole tudo → Run
-- ============================================================

-- 1) Balões/tanques (espelho exato do estado do painel; floats completos)
create table if not exists public.tanks (
  id bigint generated always as identity primary key,
  owner_id uuid not null,
  balloon_id int not null,
  name text not null,
  capacity double precision not null,
  current_level double precision not null default 0,
  initial_level double precision not null default 0,
  product_id text not null default 'vazio',
  machine_ids text[] not null default '{}',
  machine_flow jsonb not null default '{}',
  expected_accum double precision not null default 0,
  is_running boolean not null default false,
  session_start bigint,
  session_accum bigint not null default 0,
  estimated_finish_at timestamptz,
  is_paused boolean not null default false,
  paused_at timestamptz,
  total_paused_ms bigint not null default 0,
  cip_hours double precision not null default 72,
  cip_done_at timestamptz,
  cip_washing boolean not null default false,
  cip_wash_ends_at timestamptz,
  cip_wash_minutes double precision not null default 5,
  form_recipe text,
  form_running boolean not null default false,
  form_start_at bigint,
  form_accum_ms bigint not null default 0,
  form_done boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (owner_id, balloon_id)
);
create index if not exists idx_tanks_owner on public.tanks (owner_id);

-- 2) Links de compartilhamento somente leitura
create table if not exists public.tank_share_links (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  is_active boolean not null default true
);
create index if not exists idx_tank_share_links_token
  on public.tank_share_links (token);
create index if not exists idx_tank_share_links_owner
  on public.tank_share_links (created_by);

-- 3) RLS — MODO SIMPLES (sem login): libera anon nas 2 tabelas.
-- ATENÇÃO: qualquer pessoa com a URL/chave anon pode ler e gravar.
-- Para produção com login, troque pelas policies de dono (modelo abaixo).
alter table public.tanks enable row level security;
alter table public.tank_share_links enable row level security;

drop policy if exists "simple anon all tanks" on public.tanks;
create policy "simple anon all tanks"
  on public.tanks for all
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists "simple anon all share links" on public.tank_share_links;
create policy "simple anon all share links"
  on public.tank_share_links for all
  to anon, authenticated
  using (true)
  with check (true);

-- 4) Tempo real (push instantâneo para a página pública)
alter publication supabase_realtime add table public.tanks;

-- ============================================================
-- MODELO COM LOGIN (futuro — deixe comentado por enquanto)
-- ============================================================
-- -- Dono: acesso total às próprias linhas
-- -- create policy "owner full access tanks"
-- --   on public.tanks for all
-- --   using (auth.uid() = owner_id)
-- --   with check (auth.uid() = owner_id);
-- --
-- -- Leitura pública dos tanques do dono de um token válido e ativo
-- -- create policy "public read tanks with valid share token"
-- --   on public.tanks for select
-- --   to anon
-- --   using (
-- --     exists (
-- --       select 1 from public.tank_share_links l
-- --       where l.created_by = tanks.owner_id
-- --         and l.is_active = true
-- --         and (l.expires_at is null or l.expires_at > now())
-- --     )
-- --   );
