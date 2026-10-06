import { supabase, isSupabaseEnabled, getOwnerId } from './supabaseClient';
import { BALLOON_CONFIG } from './constants';

const isoOrNull = (ms) => (typeof ms === 'number' && ms > 0 ? new Date(ms).toISOString() : null);
const msOrNull = (iso) => {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
};
const num = (v, fb = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fb;
};

/** Balão (app) -> linha (banco). Floats completos, sem arredondar. */
export function balloonToRow(b, ownerId) {
  return {
    owner_id: ownerId,
    balloon_id: b.id,
    name: b.name,
    capacity: b.capacity,
    current_level: b.currentVolume,
    initial_level: b.initialVolume,
    product_id: b.productId,
    machine_ids: Array.isArray(b.machineIds) ? b.machineIds : [],
    machine_flow: b.machineFlow && typeof b.machineFlow === 'object' ? b.machineFlow : {},
    expected_accum: b.expectedAccum || 0,
    is_running: !!b.isRunning,
    session_start: typeof b.sessionStart === 'number' ? b.sessionStart : null,
    session_accum: b.sessionAccum || 0,
    estimated_finish_at: isoOrNull(b.estimatedFinishAt),
    is_paused: !!b.pausedAt,
    paused_at: isoOrNull(b.pausedAt),
    total_paused_ms: b.totalPausedMs || 0,
    cip_hours: b.cipHours,
    cip_done_at: isoOrNull(b.cipDoneAt),
    cip_washing: !!b.cipWashing,
    cip_wash_start_at: isoOrNull(b.cipWashStartAt),
    cip_wash_ends_at: isoOrNull(b.cipWashEndsAt),
    form_recipe: b.formRecipe || null,
    form_product_id: b.formProductId || null,
    form_target_liters: b.formTargetLiters || 0,
    form_running: !!b.formRunning,
    form_start_at: typeof b.formStartAt === 'number' ? b.formStartAt : null,
    form_accum_ms: b.formAccumMs || 0,
    form_done: !!b.formDone,
    updated_at: new Date().toISOString(),
  };
}

/** Linha (banco) -> balão (app). isRunning sempre volta desligado. */
export function rowToBalloon(r, cfg) {
  const ids = Array.isArray(r.machine_ids) ? r.machine_ids : [];
  const mf = r.machine_flow && typeof r.machine_flow === 'object' ? r.machine_flow : {};
  const machineFlow = {};
  ids.forEach((id) => {
    const p = Number(mf[id]);
    machineFlow[id] = Number.isFinite(p) ? Math.max(0, Math.min(100, p)) : 100;
  });
  return {
    id: cfg.id,
    name: cfg.name,
    capacity: cfg.capacity,
    currentVolume: Math.max(0, Math.min(num(r.current_level), cfg.capacity)),
    initialVolume: Math.max(0, Math.min(num(r.initial_level), cfg.capacity)),
    productId: typeof r.product_id === 'string' ? r.product_id : 'vazio',
    machineIds: ids,
    machineFlow,
    expectedAccum: 0,
    isRunning: false,
    sessionStart: null,
    sessionAccum: 0,
    estimatedFinishAt: msOrNull(r.estimated_finish_at),
    pausedAt: null,
    totalPausedMs: num(r.total_paused_ms),
    cipHours: num(r.cip_hours, 72) > 0 ? num(r.cip_hours, 72) : 72,
    cipDoneAt: msOrNull(r.cip_done_at),
    cipWashing: r.cip_washing === true,
    cipWashStartAt: msOrNull(r.cip_wash_start_at),
    cipWashEndsAt: msOrNull(r.cip_wash_ends_at),
    formRecipe: r.form_recipe === 'grande' ? 'grande' : r.form_recipe === 'normal' ? 'normal' : null,
    formProductId: typeof r.form_product_id === 'string' ? r.form_product_id : null,
    formTargetLiters: Math.max(0, num(r.form_target_liters)),
    formRunning: r.form_running === true,
    formStartAt: typeof r.form_start_at === 'number' ? r.form_start_at : null,
    formAccumMs: Math.max(0, num(r.form_accum_ms)),
    formDone: r.form_done === true,
  };
}

/** Linhas brutas dos tanques de um dono (p/ página pública). Null se indisponível. */
export async function fetchOwnerRows(ownerId) {
  if (!isSupabaseEnabled || !ownerId) return null;
  try {
    const { data, error } = await supabase
      .from('tanks')
      .select('*')
      .eq('owner_id', ownerId)
      .order('balloon_id');
    if (error || !Array.isArray(data) || data.length === 0) return null;
    return data;
  } catch {
    return null;
  }
}

/** Baixa os 3 balões do dono. Retorna null se indisponível/sem dados. */
export async function fetchRemoteBalloons() {
  if (!isSupabaseEnabled) return null;
  const { data, error } = await supabase
    .from('tanks')
    .select('*')
    .eq('owner_id', getOwnerId())
    .order('balloon_id');
  if (error || !Array.isArray(data) || data.length === 0) return null;
  return BALLOON_CONFIG.map((cfg) => {
    const row = data.find((r) => r.balloon_id === cfg.id);
    return row ? rowToBalloon(row, cfg) : null;
  }).filter(Boolean);
}

/** Sobe os 3 balões (upsert por owner+balloon). Erro vai p/ console + status. */
export async function pushRemoteBalloons(balloons) {
  if (!isSupabaseEnabled || !Array.isArray(balloons)) return false;
  try {
    const ownerId = getOwnerId();
    const rows = balloons.map((b) => balloonToRow(b, ownerId));
    const { error } = await supabase
      .from('tanks')
      .upsert(rows, { onConflict: 'owner_id,balloon_id' });
    if (error) {
      console.warn('[nuvem] falha no envio:', error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.warn('[nuvem] falha no envio:', e?.message || e);
    return false;
  }
}
