-- Migração: janela início/fim da lavagem CIP (rode no SQL Editor)
alter table public.tanks add column if not exists cip_wash_start_at timestamptz;
