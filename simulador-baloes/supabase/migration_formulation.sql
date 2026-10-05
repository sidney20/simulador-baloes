-- Migração: FORMULAÇÃO DO PRODUTO (rode no SQL Editor se o schema base já foi aplicado)
alter table public.tanks add column if not exists form_recipe text;
alter table public.tanks add column if not exists form_product_id text;
alter table public.tanks add column if not exists form_running boolean not null default false;
alter table public.tanks add column if not exists form_start_at bigint;
alter table public.tanks add column if not exists form_accum_ms bigint not null default 0;
alter table public.tanks add column if not exists form_done boolean not null default false;
