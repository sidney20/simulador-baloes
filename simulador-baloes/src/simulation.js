import { MACHINES } from './constants.js';

// ============================================================
// Motor de cálculo da puxada — PRECISÃO ABSOLUTA
// REGRA DE OURO:
//   1 máquina = 1.600 L/h exatos = 26.6666666667 L/min = 0.4444444444 L/s
//   2 máquinas = 3.200 L/h exatos = 53.3333333333 L/min = 0.8888888889 L/s
//
// ATENÇÃO: NUNCA arredonde dentro deste arquivo.
// Sem Math.round(), sem toFixed(), sem parseInt() no cálculo.
// Arredondamento só na EXIBIÇÃO (componentes visuais).
// ============================================================

/**
 * VAZÃO MÁXIMA DE REFERÊNCIA DA MÁQUINA — configuração central.
 * 100% = 1.600 litros por hora. Para mudar a vazão máxima real no futuro,
 * altere SÓ este valor: todo o sistema recalcula automaticamente.
 */
export const MAX_FLOW_RATE = 1600;
// Alias de compatibilidade (mesmo valor, mesma fonte).
export const LITERS_PER_HOUR_PER_MACHINE = MAX_FLOW_RATE;
export const SECONDS_PER_HOUR = 3600;

/**
 * Vazão em litros/hora para N máquinas PADRÃO (1600) a P porcento:
 *   vazão = N × MAX_FLOW_RATE × (percent / 100)
 * Ex: (1, 100) = 1600 · (1, 75) = 1200 · (1, 50) = 800 · (1, 37) = 592
 *     (1, 10) = 160 · (1, 1) = 16 · (2, 100) = 3200 · (x, 0) = 0
 * Aceita qualquer porcentagem (inclusive decimais). Float completo.
 */
export function flowRatePerHour(machineCount, percent = 100) {
  return machineCount * MAX_FLOW_RATE * (percent / 100);
}

/**
 * Vazão máxima (100%) de uma máquina pelo ID.
 * SIG-01/SIG-02 = 1.600 L/h · SIG-03 UHT = 12.000 L/h.
 */
export function machineMaxFlow(mid) {
  const m = MACHINES.find((x) => x.id === mid);
  return m?.maxFlow || MAX_FLOW_RATE;
}

/**
 * % efetivo de uma máquina: número (vale p/ todas) ou mapa {id: %} individual.
 * Valores inválidos viram 100. Aceita decimais. Float completo.
 */
export function percentOf(percent, mid) {
  const raw = percent !== null && typeof percent === 'object' ? percent[mid] : percent;
  const p = Number(raw);
  return Number.isFinite(p) ? p : 100;
}

/**
 * Vazão INDIVIDUAL de uma máquina em L/h:
 *   vazão = maxFlow × (percentual / 100)
 * Ex: SIG-01@100% = 1600 · SIG-01@75% = 1200 · SIG-01@38% = 608 · SIG-03@50% = 6000
 */
export function machineFlowRate(mid, percent = 100) {
  return machineMaxFlow(mid) * (percentOf(percent, mid) / 100);
}

/**
 * Vazão TOTAL em litros/hora = SOMA das vazões individuais ativas.
 * Ex: [01@100%, 02@75%] = 1600+1200 = 2800 · [01@75%, 02@25%] = 1200+400 = 1600
 * `percent` pode ser número único (todas) ou mapa {id: %} individual.
 * Float completo, sem arredondar.
 */
export function flowRatePerHourForIds(ids, percent = 100) {
  const list = Array.isArray(ids) ? ids : [];
  return list.reduce((sum, id) => sum + machineFlowRate(id, percent), 0);
}

/**
 * Consumo em litros para a LISTA de máquinas durante S segundos.
 * Ex: [SIG-03]@100% por 3600s = 12000 · [SIG-01]@100% por 3600s = 1600.
 */
export function calculateConsumptionForIds(ids, seconds, percent = 100) {
  return flowRatePerHourForIds(ids, percent) * (seconds / SECONDS_PER_HOUR);
}

/**
 * Higieniza o mapa {id: %} para os ids ativos (0..100, sem arredondar).
 * Aceita mapa ou número único (aplica a todos — migração do formato antigo).
 */
export function sanitizeMachineFlowMap(value, ids) {
  const list = Array.isArray(ids) ? ids : [];
  const out = {};
  for (const id of list) {
    const raw = value !== null && typeof value === 'object' ? value[id] : value;
    const p = Number(raw);
    out[id] = Number.isFinite(p) ? Math.max(0, Math.min(100, p)) : 100;
  }
  return out;
}

/**
 * ETA a partir da LISTA de máquinas (usa a vazão efetiva de cada uma).
 * Retorna timestamp (ms) ou null se sem vazão/nível.
 */
export function calculateFixedEtaForIds(currentVolume, ids, nowMs = Date.now(), percent = 100) {
  const flow = flowRatePerHourForIds(ids, percent);
  if (!(flow > 0) || !(currentVolume > 0)) return null;
  return nowMs + (currentVolume / flow) * 3600000;
}

/**
 * Consumo em litros para N máquinas durante S segundos a P porcento.
 * Ex: calculateConsumption(1, 3600) = 1600
 *     calculateConsumption(2, 3600) = 3200
 *     calculateConsumption(1, 1)    = 0.4444444444444444
 * (percent omitido = 100%, comportamento anterior preservado)
 */
export function calculateConsumption(machineCount, seconds, percent = 100) {
  return flowRatePerHour(machineCount, percent) * (seconds / SECONDS_PER_HOUR);
}

/** Vazão em litros por segundo (float completo). */
export function ratePerSecond(machineCount, percent = 100) {
  return flowRatePerHour(machineCount, percent) / SECONDS_PER_HOUR;
}

/** Vazão em litros por minuto (float completo). */
export function ratePerMinute(machineCount, percent = 100) {
  return flowRatePerHour(machineCount, percent) / 60;
}

export const BRASILIA_TZ = 'America/Sao_Paulo';

/** "15/05 às 14:37:15" em horário de Brasília. Só exibição (p/ ETA travada). */
export function formatBrasiliaDateTime(date) {
  const d = new Intl.DateTimeFormat('pt-BR', {
    timeZone: BRASILIA_TZ,
    day: '2-digit',
    month: '2-digit',
  }).format(date);
  const t = new Intl.DateTimeFormat('pt-BR', {
    timeZone: BRASILIA_TZ,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date);
  return `${d} às ${t}`;
}

/**
 * Calcula a ETA travada no momento do PLAY:
 *   horasRestantes = nivelAtual / vazãoEfetiva
 *   horaFinal = agora + horasRestantes
 * Ex: 35000 L / 1600 = 21.875 h = 21h52min30s.
 * Retorna timestamp (ms) ou null se sem vazão/nível.
 * (percent omitido = 100%, comportamento anterior preservado)
 */
export function calculateFixedEta(currentVolume, machineCount, nowMs = Date.now(), percent = 100) {
  const flow = flowRatePerHour(machineCount, percent);
  if (!(flow > 0) || !(currentVolume > 0)) return null;
  return nowMs + (currentVolume / flow) * 3600000;
}

/**
 * CIP (limpeza): estado da validade.
 *   - pending: nunca realizado (cipDoneAt null) ou validade zerada
 *   - valid:   dentro do prazo (cipDoneAt + horas)
 *   - expired: prazo estourou — balão precisa ser cipado
 * Só exibição usa os textos; a lógica usa os timestamps.
 */
export function cipStatus(cipDoneAt, cipHours, nowMs = Date.now()) {
  const validHours = Number(cipHours) || 0;
  if (!cipDoneAt || !(validHours > 0)) {
    return { state: 'pending', expiresAt: null, remainingMs: 0, overdueMs: 0 };
  }
  const expiresAt = cipDoneAt + validHours * 3600000;
  const remainingMs = expiresAt - nowMs;
  if (remainingMs <= 0) {
    return { state: 'expired', expiresAt, remainingMs: 0, overdueMs: -remainingMs };
  }
  return { state: 'valid', expiresAt, remainingMs, overdueMs: 0 };
}

/** true somente se o CIP está dentro da validade. */
export function isCipValid(cipDoneAt, cipHours, nowMs = Date.now()) {
  return cipStatus(cipDoneAt, cipHours, nowMs).state === 'valid';
}

/**
 * "11h52m09s" (ou "2d 5h 12m" acima de 1 dia) a partir de milissegundos.
 * Com segundos visíveis, a contagem desce ao vivo a cada segundo.
 * Só exibição.
 */
export function formatCountdownFull(ms) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const p2 = (n) => String(n).padStart(2, '0');
  if (d > 0) return `${d}d ${h}h ${p2(m)}m`;
  return `${h}h${p2(m)}m${p2(s)}s`;
}

/** "04:37" (mm:ss) a partir de milissegundos. Só exibição. */
export function formatClockMS(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/** "01:50:00" (HH:MM:SS) a partir de milissegundos. Só exibição. */
export function formatHMS(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const p2 = (n) => String(n).padStart(2, '0');
  return `${p2(h)}:${p2(m)}:${p2(ss)}`;
}

/** Duração da receita em ms (normal = 110min, grande = 170min). */
export function recipeDurationMs(recipe) {
  const minutes = recipe === 'grande' ? 170 : recipe === 'normal' ? 110 : 0;
  return minutes * 60 * 1000;
}

/** Tempo decorrido da formulação em ms (pausa congela, retomar continua). */
export function formElapsedMs(form, nowMs = Date.now()) {
  if (!form) return 0;
  const accum = Number(form.accumMs) || 0;
  const live = form.running && form.startAt ? nowMs - form.startAt : 0;
  return Math.max(0, accum + live);
}

/** Progresso 0..1 = decorrido / total (controla o nível visual). */
export function formProgress(form, nowMs = Date.now()) {
  if (!form || !form.recipe) return 0;
  const total = recipeDurationMs(form.recipe);
  if (!(total > 0)) return 0;
  return Math.max(0, Math.min(1, formElapsedMs(form, nowMs) / total));
}

/** true se existe sessão de formulação (iniciada, pausada ou concluída). */
export function hasFormSession(form) {
  if (!form || !form.recipe) return false;
  return !!(form.running || form.done || (Number(form.accumMs) || 0) > 0 || form.startAt);
}

/**
 * Validação obrigatória: simula 1 hora em ticks de 1 segundo usando a MESMA
 * função calculateConsumption do app, num tanque virtual (capacity 40000,
 * nível inicial 35000 — sem risco de zerar no meio do teste).
 * Retorna puxado, esperado, diferença e aprovação (tolerância 1e-6 L).
 */
export function runOneHourValidation(machineCount, options = {}) {
  const capacity = options.capacity ?? 40000;
  const startLevel = options.startLevel ?? 35000;
  let level = startLevel;
  let pulled = 0;
  for (let s = 0; s < 3600; s++) {
    const c = calculateConsumption(machineCount, 1);
    const take = Math.min(c, level);
    level -= take;
    pulled += take;
    if (level <= 0) break;
  }
  const expected = machineCount * LITERS_PER_HOUR_PER_MACHINE;
  const diff = pulled - expected;
  return {
    machineCount,
    capacity,
    startLevel,
    endLevel: level,
    pulled,
    expected,
    diff,
    passed: Math.abs(diff) < 1e-6,
  };
}
