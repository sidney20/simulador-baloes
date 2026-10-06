import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** true quando as variáveis VITE_SUPABASE_* estão configuradas. */
export const isSupabaseEnabled = Boolean(url && key);

export const supabase = isSupabaseEnabled ? createClient(url, key) : null;

/**
 * DONO FIXO da fábrica: um único identificador para TODOS os aparelhos.
 * Assim o painel do PC, o site e o celular veem e editam os MESMOS balões,
 * e o link único sempre mostra os dados certos. Sem login, sem “cadernos”.
 */
export const FACTORY_OWNER_ID = '00000000-0000-0000-0000-000000000001';

export function getOwnerId() {
  return FACTORY_OWNER_ID;
}
