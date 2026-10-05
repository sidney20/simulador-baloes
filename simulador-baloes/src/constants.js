export const PRODUCTS = [
  { id: 'creme-leve', name: 'Creme Leve', color: '#FFFFFF', glowColor: 'rgba(255,255,255,0.6)' },
  { id: 'base-culinaria', name: 'Base Culinária', color: '#FFFEF5', glowColor: 'rgba(255,254,245,0.5)' },
  { id: 'choco-tri', name: 'ChocoTri', color: '#5D4037', glowColor: 'rgba(93,64,55,0.5)' },
  { id: 'power-tri-chocolate', name: 'PowerTri de Chocolate', color: '#3E2723', glowColor: 'rgba(62,39,35,0.5)' },
  { id: 'power-tri-morango', name: 'PowerTri de Morango', color: '#E91E63', glowColor: 'rgba(233,30,99,0.5)' },
  { id: 'vazio', name: 'BALÃO VAZIO', color: 'transparent', glowColor: 'transparent', isEmpty: true },
];

export const BALLOON_CONFIG = [
  { id: 1, name: 'Balão 01', capacity: 15000, unit: 'L' },
  { id: 2, name: 'Balão 02', capacity: 15000, unit: 'L' },
  { id: 3, name: 'Balão 03', capacity: 30000, unit: 'L' },
];

// Máquinas envasadoras nomeadas. Cada balão suporta no MÁXIMO 2.
// SIG-03 UHT opera SEMPRE sozinha (puxa muito, não divide o balão).
export const MACHINES = [
  { id: 'SIG-01', name: 'SIG-01', solo: false, maxFlow: 1600 },
  { id: 'SIG-02', name: 'SIG-02', solo: false, maxFlow: 1600 },
  // SIG-03 UHT puxa até 12.000 L/h (a 100%) — por isso opera sempre sozinha
  { id: 'SIG-03', name: 'SIG-03 UHT', solo: true, maxFlow: 12000 },
];

export const MAX_MACHINES_PER_BALLOON = 2;

/**
 * Liga/desliga uma máquina no balão aplicando as regras:
 * - SIG-03 sempre sozinha (liga só ela / desliga tudo)
 * - SIG-01 e SIG-02 podem ir juntas (máx. 2 por balão)
 * - Ligar 01/02 remove a 03 (ela não divide)
 */
export function toggleMachineIds(ids, mid) {
  const list = Array.isArray(ids) ? ids.filter((id) => MACHINES.some((m) => m.id === id)) : [];
  const machine = MACHINES.find((m) => m.id === mid);
  if (!machine) return list;
  if (machine.solo) {
    return list.includes(mid) ? [] : [mid];
  }
  if (list.includes(mid)) return list.filter((id) => id !== mid);
  const next = [...list.filter((id) => id !== 'SIG-03'), mid];
  return next.slice(-MAX_MACHINES_PER_BALLOON);
}

/** Normaliza seleção salva (ou migra contagem antiga 0/1/2 para nomes). */
export function normalizeMachineIds(value) {
  const raw = Array.isArray(value)
    ? value
    : value === 2
      ? ['SIG-01', 'SIG-02']
      : value === 1
        ? ['SIG-01']
        : [];
  const clean = raw.filter((id) => MACHINES.some((m) => m.id === id));
  if (clean.includes('SIG-03')) return ['SIG-03'];
  return clean.slice(-MAX_MACHINES_PER_BALLOON);
}

export const STORAGE_KEY = 'simulador-baloes-state';

// Alerta de nível baixo: giroflex vermelho quando restam 300 L ou menos
export const LOW_LEVEL_THRESHOLD = 300;

// CIP (limpeza): validade padrão em horas após realizado
export const DEFAULT_CIP_HOURS = 72;

// Lavagem CIP: duração padrão em minutos (balão vazio, spray ball 360°)
export const DEFAULT_CIP_WASH_MINUTES = 5;

// FORMULAÇÃO DO PRODUTO: durações das receitas em SEGUNDOS (central).
// normal = 1h50min = 110min · grande = 2h50min = 170min
export const RECEITA_NORMAL_DURATION = 110 * 60;
export const RECEITA_GRANDE_DURATION = 170 * 60;
export const RECIPES = [
  { id: 'normal', name: 'Receita normal', minutes: 110, label: 'Receita normal — 1h50min' },
  { id: 'grande', name: 'Receita grande', minutes: 170, label: 'Receita grande — 2h50min' },
];