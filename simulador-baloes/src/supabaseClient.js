import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** true quando as variáveis VITE_SUPABASE_* estão configuradas. */
export const isSupabaseEnabled = Boolean(url && key);

export const supabase = isSupabaseEnabled ? createClient(url, key) : null;

/**
 * Identificador do dono deste painel (um UUID por navegador).
 * Sem login, é ele que separa os balões de cada aparelho no banco.
 */
const OWNER_KEY = 'simulador-baloes-owner-id';

export function getOwnerId() {
  try {
    let id = localStorage.getItem(OWNER_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(OWNER_KEY, id);
    }
    return id;
  } catch {
    return '00000000-0000-0000-0000-000000000000';
  }
}
