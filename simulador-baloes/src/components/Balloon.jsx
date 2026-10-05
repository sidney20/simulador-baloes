'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PRODUCTS, LOW_LEVEL_THRESHOLD } from '../constants';
import { formatBrasiliaDateTime, cipStatus, formatCountdownFull, formatClockMS, flowRatePerHourForIds, machineFlowRate, percentOf } from '../simulation';
import SprayBall360 from './SprayBall360';

// Geometria interna do vidro (coordenadas do viewBox 0 0 250 520)
const INNER = { left: 29, right: 131, top: 66, bottom: 488 };
const INNER_W = INNER.right - INNER.left;
const INNER_H = INNER.bottom - INNER.top;

const GLASS_PATH =
  'M 34 60 C 26 90, 24 120, 24 160 L 24 440 C 24 472, 28 488, 40 494 L 120 494 C 132 488, 136 472, 136 440 L 136 160 C 136 120, 134 90, 126 60 Z';
const INNER_PATH =
  'M 39 66 C 31 95, 29 125, 29 162 L 29 438 C 29 468, 33 482, 43 488 L 117 488 C 127 482, 131 468, 131 438 L 131 162 C 131 125, 129 95, 121 66 Z';

const BUBBLES = [
  { cx: 52, r: 3.5, delay: '0s', dur: '3.2s' },
  { cx: 70, r: 2.5, delay: '0.8s', dur: '2.6s' },
  { cx: 88, r: 4, delay: '1.6s', dur: '3.8s' },
  { cx: 104, r: 2.8, delay: '0.4s', dur: '2.9s' },
  { cx: 62, r: 2, delay: '2.1s', dur: '3.4s' },
  { cx: 96, r: 3, delay: '1.1s', dur: '3s' },
];

const Balloon = ({
  id,
  name,
  capacity,
  currentVolume,
  productId,
  isRunning,
  isEmpty,
  machines,
  machineIds,
  machineFlow,
  estimatedFinishAt,
  cipHours,
  cipDoneAt,
  cipWashing,
  cipWashEndsAt,
}) => {
  const product = PRODUCTS.find(p => p.id === productId) || PRODUCTS[0];
  const percentage = isEmpty ? 0 : Math.max(0, Math.min(100, (currentVolume / capacity) * 100));
  const hasLiquid = !product.isEmpty && percentage > 0;

  // Topo do líquido dentro do vidro (100% = topo interno, 0% = fundo interno)
  const liquidTop = INNER.bottom - (INNER_H * percentage) / 100;
  const liquidHeight = Math.max(0, INNER.bottom - liquidTop);

  const rulerTicks = [];
  for (let p = 0; p <= 100; p += 10) {
    rulerTicks.push({
      percent: p,
      y: 495 - (p / 100) * 440,
      value: Math.round((capacity * p) / 100),
    });
  }

  const waveD = `M -30 ${liquidTop.toFixed(1)} C -10 ${(liquidTop - 7).toFixed(1)}, 10 ${(liquidTop - 7).toFixed(1)}, 30 ${liquidTop.toFixed(1)} S 70 ${(liquidTop + 7).toFixed(1)}, 90 ${liquidTop.toFixed(1)} S 130 ${(liquidTop - 7).toFixed(1)}, 150 ${liquidTop.toFixed(1)} S 190 ${(liquidTop + 7).toFixed(1)}, 210 ${liquidTop.toFixed(1)} L 210 ${(liquidTop + 12).toFixed(1)} L -30 ${(liquidTop + 12).toFixed(1)} Z`;

  // ETA TRAVADA (estimatedFinishAt): calculada uma única vez no PLAY.
  // Este componente SÓ exibe o valor guardado — nunca recalcula.
  // Relógio ao vivo: atualiza a cada segundo p/ o countdown do CIP descer
  // na tela mesmo com o balão parado (a ETA travada NÃO se mexe).
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const cip = cipStatus(cipDoneAt, cipHours, nowTick);

  // Alerta de nível baixo: giroflex vermelho com 300 L ou menos (e não vazio)
  const isLow = !isEmpty && currentVolume <= LOW_LEVEL_THRESHOLD;

  return (
    <div className={`relative flex flex-col items-center gap-3 sm:gap-4 glass-panel p-4 sm:p-6 min-w-0 w-full flex-1 transition-shadow duration-300 ${isLow ? 'ring-2 ring-red-500/80 shadow-[0_0_45px_rgba(239,68,68,0.35)]' : ''} ${cipWashing ? 'ring-2 ring-sky-400/80 shadow-[0_0_45px_rgba(56,189,248,0.35)]' : ''}`}>
      <div className="w-full text-center mb-2">
        <h3 className="text-xl font-bold text-white tracking-tight">{name}</h3>
        <p className="text-slate-400 text-sm mt-1">Capacidade: {capacity.toLocaleString('pt-BR')} L</p>
        <div className="mt-2 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-800/60 border border-slate-700/60">
          <span
            className="w-4 h-4 rounded-full border border-white/30 shrink-0"
            style={{
              background: product.isEmpty
                ? 'repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(255,255,255,0.25) 3px, rgba(255,255,255,0.25) 6px)'
                : product.color,
            }}
          />
          <span className={`text-sm font-bold ${product.isEmpty ? 'text-slate-400' : 'text-white'}`}>
            {product.name}
          </span>
        </div>
        <div className="mt-1.5 flex items-center justify-center gap-1.5 flex-wrap">
          <span className="text-[11px] text-slate-500">🔧</span>
          {(machineIds || []).length > 0 ? (
            (machineIds || []).map((mid) => (
              <span
                key={mid}
                className={`px-2 py-0.5 rounded-full text-[11px] font-bold border ${
                  isRunning
                    ? 'bg-cyan-600/25 border-cyan-400/60 text-cyan-200'
                    : 'bg-slate-800/60 border-slate-600/60 text-slate-300'
                }`}
              >
                {mid}
              </span>
            ))
          ) : (
            <span className="text-[11px] text-slate-500">nenhuma máquina</span>
          )}
        </div>
      </div>

      {/* Giroflex de alerta — aceso e piscando em nível baixo */}
      <div className="flex flex-col items-center -mb-1" title={isLow ? 'Nível baixo!' : 'Nível OK'}>
        <div
          className={`w-9 h-9 rounded-full border-2 ${
            isLow
              ? 'bg-gradient-to-br from-red-400 to-red-700 border-red-300 animate-alarm'
              : 'bg-slate-700/60 border-slate-600'
          }`}
        />
        <div className="w-2 h-2 bg-slate-600 rounded-b" />
      </div>

      <div className="w-full flex justify-center">
        <div className="relative">
        <svg
          viewBox="0 0 250 520"
          className="h-[380px] sm:h-[440px] w-auto max-w-full"
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            <linearGradient id={`sheen${id}`} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.16" />
              <stop offset="15%" stopColor="#ffffff" stopOpacity="0.03" />
              <stop offset="50%" stopColor="#ffffff" stopOpacity="0" />
              <stop offset="85%" stopColor="#ffffff" stopOpacity="0.05" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="0.14" />
            </linearGradient>
            <linearGradient id={`shade${id}`} x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#000000" stopOpacity="0" />
              <stop offset="100%" stopColor="#000000" stopOpacity="0.35" />
            </linearGradient>
            <linearGradient id={`edge${id}`} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#000000" stopOpacity="0.28" />
              <stop offset="12%" stopColor="#000000" stopOpacity="0" />
              <stop offset="50%" stopColor="#000000" stopOpacity="0" />
              <stop offset="88%" stopColor="#000000" stopOpacity="0" />
              <stop offset="100%" stopColor="#000000" stopOpacity="0.28" />
            </linearGradient>
            <linearGradient id={`topGlow${id}`} x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.22" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
            </linearGradient>
            {/* Prata metálico do estado VAZIO (todo prata, nunca branco) */}
            <linearGradient id={`silver${id}`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#f1f5f9" />
              <stop offset="25%" stopColor="#cbd5e1" />
              <stop offset="50%" stopColor="#94a3b8" />
              <stop offset="75%" stopColor="#e2e8f0" />
              <stop offset="100%" stopColor="#64748b" />
            </linearGradient>
            <clipPath id={`innerClip${id}`}>
              <path d={INNER_PATH} />
            </clipPath>
          </defs>

          {/* Fundo do vidro */}
          <path
            d={GLASS_PATH}
            fill="rgba(148,163,184,0.12)"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth="1"
          />

          {/* VAZIO = TODO PRATA (metálico, nunca branco) */}
          {isEmpty && (
            <g clipPath={`url(#innerClip${id})`}>
              <rect
                x={INNER.left}
                y={INNER.top}
                width={INNER_W}
                height={INNER_H}
                fill={`url(#silver${id})`}
              />
              <rect
                x={INNER.left}
                y={INNER.top}
                width={INNER_W}
                height={INNER_H}
                fill={`url(#edge${id})`}
              />
              <rect
                x={INNER.left + 9}
                y={INNER.top}
                width={10}
                height={INNER_H}
                rx={5}
                fill="#ffffff"
                opacity={0.25}
              />
              {!cipWashing && (
                <text
                  x={80}
                  y={280}
                  textAnchor="middle"
                  fill="#475569"
                  fontSize="17"
                  fontWeight={700}
                  fontFamily="monospace"
                  letterSpacing={3}
                >
                  VAZIO
                </text>
              )}
            </g>
          )}

          {/* Líquido — sempre recortado para dentro do vidro */}
          {hasLiquid && (
            <g clipPath={`url(#innerClip${id})`}>
              {/* Corpo do líquido (transição de 1s p/ animar suave entre os ticks) */}
              <rect
                x={INNER.left}
                y={liquidTop}
                width={INNER_W}
                height={liquidHeight}
                fill={product.color}
                style={{ transition: 'fill 0.6s ease, y 1s linear, height 1s linear' }}
              />
              {/* Sombra inferior (profundidade) */}
              <rect
                x={INNER.left}
                y={liquidTop}
                width={INNER_W}
                height={liquidHeight}
                fill={`url(#shade${id})`}
                style={{ transition: 'y 1s linear, height 1s linear' }}
              />
              {/* Sombra nas bordas (efeito arredondado) */}
              <rect
                x={INNER.left}
                y={liquidTop}
                width={INNER_W}
                height={liquidHeight}
                fill={`url(#edge${id})`}
                style={{ transition: 'y 1s linear, height 1s linear' }}
              />
              {/* Brilho sob a superfície */}
              <rect
                x={INNER.left}
                y={liquidTop}
                width={INNER_W}
                height={Math.min(30, liquidHeight)}
                fill={`url(#topGlow${id})`}
                style={{ transition: 'y 1s linear, height 1s linear' }}
              />
              {/* Reflexo vertical esquerdo */}
              <rect
                x={INNER.left + 9}
                y={liquidTop}
                width={10}
                height={liquidHeight}
                rx={5}
                fill="#ffffff"
                opacity={0.14}
                style={{ transition: 'y 1s linear, height 1s linear' }}
              />

              {/* Onda da superfície (oscila em torno do centro, sem deslocar) */}
              <g className="animate-liquid-wave">
                <path d={waveD} fill="#ffffff" opacity={0.22} />
                <ellipse
                  cx={80}
                  cy={liquidTop}
                  rx={38}
                  ry={4.5}
                  fill="#ffffff"
                  opacity={0.25}
                />
              </g>

              {/* Bolhas subindo */}
              {BUBBLES.map((b, i) => (
                <circle
                  key={`bubble-${i}`}
                  cx={b.cx}
                  cy={INNER.bottom - 24}
                  r={b.r}
                  fill="rgba(255,255,255,0.45)"
                  className="animate-bubble-rise"
                  style={{ animationDelay: b.delay, animationDuration: b.dur }}
                />
              ))}
            </g>
          )}

          {/* Frente do vidro: brilho + reflexos por cima do líquido */}
          <path d={GLASS_PATH} fill={`url(#sheen${id})`} />
          <path
            d={GLASS_PATH}
            fill="none"
            stroke="rgba(255,255,255,0.28)"
            strokeWidth="2"
          />
          <rect x={40} y={90} width={12} height={340} rx={6} fill="#ffffff" opacity={0.1} />
          <rect x={110} y={120} width={6} height={280} rx={3} fill="#ffffff" opacity={0.07} />

          {/* Gargalo */}
          <rect x={68} y={16} width={24} height={34} rx={3} fill="#334155" stroke="rgba(255,255,255,0.25)" />
          <rect x={60} y={44} width={40} height={9} rx={2} fill="#475569" stroke="rgba(255,255,255,0.2)" />

          {/* Régua lateral */}
          <g>
            <line x1={166} y1={55} x2={166} y2={495} stroke="rgba(255,255,255,0.2)" strokeWidth={1} strokeDasharray="5,5" />
            {rulerTicks.map(t => (
              <g key={t.percent}>
                <line
                  x1={166}
                  y1={t.y}
                  x2={176}
                  y2={t.y}
                  stroke="rgba(255,255,255,0.6)"
                  strokeWidth={t.percent % 20 === 0 ? 2 : 1}
                />
                <text
                  x={182}
                  y={t.y - 1}
                  fill="rgba(255,255,255,0.75)"
                  fontSize="11"
                  fontFamily="monospace"
                  fontWeight={600}
                >
                  {t.value.toLocaleString('pt-BR')} L
                </text>
                <text
                  x={182}
                  y={t.y + 12}
                  fill="rgba(148,163,184,0.9)"
                  fontSize="9"
                  fontFamily="monospace"
                >
                  {t.percent}%
                </text>
              </g>
            ))}
          </g>
        </svg>
        {/* Lavagem CIP: spray ball 360° sobre o balão vazio */}
        {cipWashing && <SprayBall360 />}
        </div>
      </div>

      <div className="w-full flex items-center justify-between gap-2 pt-2 border-t border-slate-700/30">
        <div className="flex-1 text-left min-w-0">
          <p className="text-xs text-slate-500 uppercase tracking-wider">Volume Atual</p>
          <p className="text-xl sm:text-2xl font-bold font-mono text-white tabular-nums truncate">
            {isEmpty ? 'VAZIO' : `${currentVolume.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} L`}
          </p>
        </div>
        <div className="flex-1 text-right min-w-0">
          <p className="text-xs text-slate-500 uppercase tracking-wider">Nível</p>
          <p className="text-xl sm:text-2xl font-bold font-mono text-white tabular-nums truncate">
            {isEmpty ? '0%' : `${percentage.toFixed(1)}%`}
          </p>
        </div>
      </div>

      <div className="w-full flex items-center gap-2">
        <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden relative">
          <motion.div
            className="h-full rounded-full relative overflow-hidden"
            style={{
              background: product.isEmpty
                ? 'linear-gradient(90deg, transparent, transparent)'
                : `linear-gradient(90deg, ${product.color}AA, ${product.color}, ${product.color}AA)`,
              width: `${percentage}%`,
              boxShadow: product.isEmpty ? 'none' : `0 0 20px ${product.glowColor}`,
            }}
            animate={{ width: `${percentage}%` }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          >
            {!product.isEmpty && percentage > 10 && (
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-glow-pulse" />
            )}
          </motion.div>
        </div>
        {isEmpty && (
          <motion.span
            className="px-3 py-1 bg-red-600/20 text-red-400 text-xs font-bold rounded-full border border-red-500/30"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3 }}
          >
            VAZIO
          </motion.span>
        )}
      </div>

      {/* Término previsto FIXO (horário de Brasília) — valor travado no PLAY */}
      {!isEmpty && estimatedFinishAt && (
        <div className="w-full text-center px-3 py-2 rounded-xl bg-cyan-500/10 border border-cyan-500/25">
          <p className="text-cyan-200 text-sm font-medium tabular-nums">
            🔒 Término previsto:{' '}
            <span className="font-bold text-white text-base">
              {formatBrasiliaDateTime(new Date(estimatedFinishAt))}
            </span>
          </p>
          <p className="text-[11px] text-slate-400">
            horário de Brasília · hora travada no início do envase
          </p>
        </div>
      )}
      {!isEmpty && !estimatedFinishAt && !isRunning && (
        <div className="w-full text-center px-3 py-2 rounded-xl bg-slate-800/50 border border-slate-700/50">
          <p className="text-slate-400 text-xs">
            Término previsto: a calcular ao apertar INICIAR
          </p>
        </div>
      )}

      {/* Lavagem CIP em andamento */}
      {cipWashing && (
        <div className="w-full text-center px-3 py-2 rounded-xl bg-sky-500/10 border border-sky-500/40 animate-pulse">
          <p className="text-sky-200 text-sm font-bold tabular-nums">
            🛁 LAVAGEM CIP EM ANDAMENTO
          </p>
          <p className="text-[11px] text-sky-300/80 tabular-nums">
            spray ball 360° · faltam {formatClockMS((cipWashEndsAt || 0) - nowTick)}
          </p>
        </div>
      )}

      {/* Estado do CIP (higiene) — countdown desce ao vivo a cada segundo */}
      {!cipWashing && cip.state === 'valid' && (
        <div className="w-full text-center px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/25">
          <p className="text-emerald-200 text-sm font-medium tabular-nums">
            🛁 CIP válido · vence {formatBrasiliaDateTime(new Date(cip.expiresAt))}
          </p>
          <p className="text-[11px] text-slate-400 tabular-nums">
            faltam {formatCountdownFull(cip.remainingMs)}
          </p>
        </div>
      )}
      {!cipWashing && cip.state === 'expired' && (
        <div className="w-full text-center px-3 py-2 rounded-xl bg-red-600/15 border border-red-500/40 animate-cip-alarm">
          <p className="text-red-300 text-sm font-bold tabular-nums">
            🔴 CIP VENCIDO há {formatCountdownFull(cip.overdueMs)}
          </p>
          <p className="text-[11px] text-red-400/80">
            balão precisa ser cipado — realize o CIP para liberar
          </p>
        </div>
      )}
      {!cipWashing && cip.state === 'pending' && (
        <div className="w-full text-center px-3 py-2 rounded-xl bg-slate-800/50 border border-slate-700/50">
          <p className="text-slate-400 text-xs">
            🛁 CIP pendente — faça a lavagem CIP para liberar o INICIAR
          </p>
        </div>
      )}

      <AnimatePresence>
        {isRunning && !isEmpty && (
          <motion.div
            key="running-indicator"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="w-full rounded-xl bg-green-500/10 border border-green-500/25 px-3 py-2"
          >
            <p className="flex items-center justify-center gap-2 text-green-400 text-sm font-bold">
              <motion.span
                className="w-2 h-2 bg-green-400 rounded-full"
                animate={{ scale: [1, 1.3, 1], opacity: [1, 0.5, 1] }}
                transition={{ duration: 1, repeat: Infinity }}
              />
              ENVASE ATIVO
            </p>
            <div className="mt-1.5 space-y-1">
              {(machineIds || []).map((mid) => {
                const p = percentOf(machineFlow, mid);
                return (
                  <div key={mid} className="flex items-center justify-between gap-2 text-xs tabular-nums">
                    <span className="text-slate-300 font-medium">{mid}</span>
                    <span className="text-slate-400 font-mono">
                      {String(p).replace('.', ',')}% — {machineFlowRate(mid, machineFlow).toLocaleString('pt-BR')} L/h
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="mt-1.5 pt-1.5 border-t border-green-500/20 flex items-center justify-between gap-2 text-sm tabular-nums">
              <span className="text-green-300 font-medium">Vazão total:</span>
              <span className="font-mono font-bold text-white">
                {flowRatePerHourForIds(machineIds, machineFlow).toLocaleString('pt-BR')} L/h
              </span>
            </div>
          </motion.div>
        )}
        {isEmpty && (
          <motion.div
            key="empty-indicator"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full flex items-center justify-center gap-2 text-red-400 text-sm font-medium"
          >
            <motion.span
              className="w-2 h-2 bg-red-400 rounded-full"
              animate={{ scale: [1, 1.3, 1], opacity: [1, 0.5, 1] }}
              transition={{ duration: 1, repeat: Infinity }}
            />
            🔴 VAZIO - Aguardando abastecimento
          </motion.div>
        )}
        {isLow && (
          <motion.div
            key="low-indicator"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-red-600/15 border border-red-500/40 text-red-300 text-sm font-bold tabular-nums"
          >
            <span className="w-2 h-2 bg-red-500 rounded-full animate-alarm" />
            ⚠ NÍVEL BAIXO — restam {currentVolume.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} L
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Balloon;