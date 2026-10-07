-- Migração: TROCA AUTOMÁTICA (rode no SQL Editor se o schema base já foi aplicado)
alter table public.tanks add column if not exists next_balloon_id int;
