'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PRODUCTS, LOW_LEVEL_THRESHOLD, RECIPES } from '../constants';
import { formatBrasiliaDateTime, cipStatus, formatCountdownFull, formatClockMS, flowRatePerHourForIds, machineFlowRate, percentOf, hasFormSession, formProgress, formElapsedMs, recipeDurationMs, formatHMS, fmtHM } from '../simulation';
import SprayBall360 from './SprayBall360';

// Geometria do tanque inox LARGO (viewBox 0 0 320 480) — estilo supervisório
const INNER = { left: 94, right: 226, top: 100, bottom: 434 };
const INNER_W = INNER.right - INNER.left;
const INNER_H = INNER.bottom - INNER.top;

const TANK_PATH =
  'M 89 130 C 87 108, 96 94, 112 90 L 208 90 C 224 94, 233 108, 231 130 L 231 400 C 231 424, 220 436, 200 440 L 120 440 C 100 436, 89 424, 89 400 Z';
const INNER_PATH =
  'M 94 132 C 92 112, 100 100, 113 96 L 207 96 C 220 100, 228 112, 226 132 L 226 398 C 226 420, 217 431, 201 434 L 119 434 C 103 431, 94 420, 94 398 Z';

const BUBBLES = [
  { cx: 108, r: 3, delay: '0s', dur: '3.2s' },
  { cx: 128, r: 2.4, delay: '0.8s', dur: '2.6s' },
  { cx: 148, r: 3.4, delay: '1.6s', dur: '3.8s' },
  { cx: 168, r: 2.6, delay: '0.4s', dur: '2.9s' },
  { cx: 188, r: 2, delay: '2.1s', dur: '3.4s' },
  { cx: 118, r: 2.8, delay: '1.1s', dur: '3s' },
];

const TIERS = [100, 75, 50, 25, 0];
const rulerY = (p) => 440 - (p / 100) * 350;

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
  cipWashStartAt,
  cipWashEndsAt,
  formulation,
  refColor,
  refProductName,
  formTargetLiters,
}) => {
  const product = PRODUCTS.find(p => p.id === productId) || PRODUCTS[0];
  const percentage = isEmpty ? 0 : Math.max(0, Math.min(100, (currentVolume / capacity) * 100));
  const hasLiquidEnvase = !product.isEmpty && percentage > 0;

  // Relógio ao vivo (countdowns). A ETA travada NÃO se mexe.
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const cip = cipStatus(cipDoneAt, cipHours, nowTick);

  // Alerta de nível baixo
  const isLow = !isEmpty && currentVolume <= LOW_LEVEL_THRESHOLD;

  // FORMULAÇÃO: sessão ativa assume o visual (fill por progresso + cano).
  const formActive = hasFormSession(formulation);
  const formPct = formActive ? formProgress(formulation, nowTick) : 0;
  const formElapsed = formActive ? formElapsedMs(formulation, nowTick) : 0;
  const formTotal = formActive ? recipeDurationMs(formulation.recipe) : 0;
  const formTarget = Math.max(0, Number(formTargetLiters) || 0);
  const formFrac = formActive && capacity > 0
    ? Math.max(0, Math.min(1, (formPct * formTarget) / capacity))
    : 0;
  const formRemaining = Math.max(0, formTarget * (1 - formPct));
  // Líquido do envase some quando a formulação assume o visual
  const hasLiquid = !formActive && hasLiquidEnvase;
  const fmtL1 = (v) => v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  // Caixa de valor: na formulação mostra os litros SUBINDO (não o VAZIO parado)
  const boxVolume = formActive ? formPct * formTarget : currentVolume;
  const boxPct = formActive ? formFrac * 100 : percentage;
  const boxEmpty = !formActive && isEmpty;
  const barColor = formActive ? refColor : product.color;

  // Nível do envase
  const liquidTop = INNER.bottom - (INNER_H * percentage) / 100;
  const liquidHeight = Math.max(0, INNER.bottom - liquidTop);
  // Nível da formulação (proporcional à meta em litros)
  const formTop = INNER.bottom - INNER_H * formFrac;
  const formHeight = Math.max(0, INNER.bottom - formTop);
  const formSurfaceBoxPct = 100 - formFrac * 100;
  const formStreamH = Math.max(0, formSurfaceBoxPct - 23);

  // Pílula de status do cabeçalho
  const status = cipWashing
    ? { label: 'LAVANDO', cls: 'bg-sky-600/30 text-sky-300 border-sky-500/40' }
    : formActive
      ? { label: 'FORMULANDO', cls: 'bg-violet-600/30 text-violet-300 border-violet-500/40' }
      : isRunning
        ? { label: 'RODANDO', cls: 'bg-green-600/30 text-green-400 border-green-500/40' }
        : isEmpty
          ? { label: 'VAZIO', cls: 'bg-red-600/30 text-red-400 border-red-500/40' }
          : isLow
            ? { label: 'NÍVEL BAIXO', cls: 'bg-red-600/30 text-red-300 border-red-500/40' }
            : { label: 'PARADO', cls: 'bg-amber-500/20 text-amber-300 border-amber-500/40' };

  // Faixa CIP + barra de estado estilo supervisório
  const cipStrip = cipWashing
    ? null
    : cip.state === 'expired'
      ? { left: '🔴 CIP VENCIDO', right: 'realize a lavagem', cls: 'text-red-400' }
      : cip.state === 'valid'
        ? { left: '🟢 CIP VÁLIDO', right: `vence ${formatCountdownFull(cip.remainingMs)}`, cls: 'text-emerald-300' }
        : { left: '⚪ SEM CIP', right: 'sem CIP registrado', cls: 'text-red-400/90' };

  const stateBar = cipWashing
    ? { dot: 'bg-sky-400', text: 'LAVAGEM CIP EM ANDAMENTO' }
    : formActive
      ? { dot: 'bg-violet-400', text: `FORMULANDO — ${refProductName} ${Math.floor(formPct * 100)}%` }
      : isRunning
        ? { dot: 'bg-green-400', text: `EM ENVASE — ${(machineIds || []).join(' + ') || '—'}` }
        : isEmpty
          ? { dot: 'bg-red-400', text: 'VAZIO — AGUARDANDO ABASTECIMENTO' }
          : isLow
            ? { dot: 'bg-red-400', text: 'NÍVEL BAIXO — ABASTECER EM BREVE' }
            : { dot: 'bg-slate-400', text: 'DISPONÍVEL — MÁQUINA PARADA' };

  const fillBody = (top, height, color) => (
    <>
      <rect
        x={INNER.left}
        y={top}
        width={INNER_W}
        height={height}
        fill={color}
        style={{ transition: 'fill 0.6s ease, y 1s linear, height 1s linear' }}
      />
      <rect
        x={INNER.left}
        y={top}
        width={INNER_W}
        height={height}
        fill={`url(#shade${id})`}
        style={{ transition: 'y 1s linear, height 1s linear' }}
      />
      <rect
        x={INNER.left}
        y={top}
        width={INNER_W}
        height={height}
        fill={`url(#edge${id})`}
        style={{ transition: 'y 1s linear, height 1s linear' }}
      />
      <rect
        x={INNER.left}
        y={top}
        width={INNER_W}
        height={Math.min(26, height)}
        fill={`url(#topGlow${id})`}
        style={{ transition: 'y 1s linear, height 1s linear' }}
      />
      {/* Superfície chapada com brilho (estilo tanque inox) */}
      <rect
        x={INNER.left + 3}
        y={top - 1}
        width={INNER_W - 6}
        height={2.5}
        rx={1.25}
        fill="#ffffff"
        opacity={0.55}
        className="animate-pulse"
      />
      <ellipse cx={160} cy={top} rx={55} ry={4} fill="#ffffff" opacity={0.22} />
    </>
  );

  return (
    <div className={`relative flex flex-col items-center gap-3 sm:gap-4 glass-panel p-4 sm:p-6 min-w-0 w-full flex-1 transition-shadow duration-300 ${isLow ? 'ring-2 ring-red-500/80 shadow-[0_0_45px_rgba(239,68,68,0.35)]' : ''} ${cipWashing ? 'ring-2 ring-sky-400/80 shadow-[0_0_45px_rgba(56,189,248,0.35)]' : ''}`}>
      {/* Cabeçalho estilo supervisório */}
      <div className="w-full">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-[11px] font-medium tracking-widest text-slate-500">UNIDADE TRIÂNGULO</p>
            <h3 className="text-xl font-bold text-white tracking-tight">{name}</h3>
          </div>
          <div className="flex items-center gap-2 mt-1 shrink-0">
            <div
              title={isLow ? 'Nível baixo!' : 'Nível OK'}
              className={`w-6 h-6 rounded-full border-2 ${
                isLow
                  ? 'bg-gradient-to-br from-red-400 to-red-700 border-red-300 animate-alarm'
                  : 'bg-slate-700/60 border-slate-600'
              }`}
            />
            <span className={`px-3 py-1 rounded-full text-[11px] font-bold border flex items-center gap-1.5 ${status.cls}`}>
              <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
              {status.label}
            </span>
          </div>
        </div>
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
        <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
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
        {cipStrip && (
          <div className="mt-2 flex items-center justify-between gap-2 px-1">
            <span className={`text-xs font-bold ${cipStrip.cls}`}>{cipStrip.left}</span>
            <span className="text-[11px] text-slate-500">{cipStrip.right}</span>
          </div>
        )}
      </div>

      <div className="w-full flex justify-center">
        <div className="relative">
        <svg
          viewBox="0 0 320 480"
          className="w-full max-w-[300px] h-auto"
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            <linearGradient id={`steel${id}`} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#333a45" />
              <stop offset="12%" stopColor="#6e7a8c" />
              <stop offset="28%" stopColor="#c2cad4" />
              <stop offset="42%" stopColor="#eef1f5" />
              <stop offset="58%" stopColor="#b9c1cc" />
              <stop offset="78%" stopColor="#5b6472" />
              <stop offset="100%" stopColor="#2b313b" />
            </linearGradient>
            <pattern id={`brushed${id}`} width="4" height="3" patternUnits="userSpaceOnUse">
              <rect width="4" height="3" fill="transparent" />
              <line x1="0" y1="1" x2="4" y2="1" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
            </pattern>
            <linearGradient id={`lidV${id}`} x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#f1f5f9" />
              <stop offset="55%" stopColor="#94a3b8" />
              <stop offset="100%" stopColor="#475569" />
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

          {/* Tampa quase encostada: só um pescoço curto aparecendo */}
          <rect x={151} y={46} width={18} height={26} fill={`url(#lidV${id})`} stroke="rgba(255,255,255,0.25)" />
          <rect x={140} y={34} width={40} height={12} rx={3} fill={`url(#lidV${id})`} stroke="rgba(255,255,255,0.3)" />
          <ellipse cx={160} cy={34} rx={20} ry={5.5} fill="#f1f5f9" opacity={0.85} />
          <rect x={151} y={66} width={18} height={6} fill="#000000" opacity={0.3} />

          {/* Corpo inox escovado fosco (sem brilho exagerado) */}
          <path d={TANK_PATH} fill={`url(#steel${id})`} />
          <path d={TANK_PATH} fill={`url(#brushed${id})`} />
          <path d={TANK_PATH} fill={`url(#shade${id})`} />
          {/* Reflexos metálicos sutis */}
          <rect x={100} y={120} width={14} height={300} rx={7} fill="#ffffff" opacity={0.13} />
          <rect x={198} y={140} width={7} height={260} rx={3.5} fill="#ffffff" opacity={0.07} />

          {/* VAZIO = TODO PRATA (metálico, nunca branco) */}
          {!formActive && isEmpty && (
            <g clipPath={`url(#innerClip${id})`}>
              <rect x={INNER.left} y={INNER.top} width={INNER_W} height={INNER_H} fill={`url(#silver${id})`} />
              <rect x={INNER.left} y={INNER.top} width={INNER_W} height={INNER_H} fill={`url(#edge${id})`} />
              {!cipWashing && (
                <text x={160} y={300} textAnchor="middle" fill="#475569" fontSize={19} fontWeight={700} fontFamily="monospace" letterSpacing={3}>
                  VAZIO
                </text>
              )}
            </g>
          )}

          {/* Líquido do envase */}
          {hasLiquid && liquidHeight > 0 && (
            <g clipPath={`url(#innerClip${id})`}>
              {fillBody(liquidTop, liquidHeight, product.color)}
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

          {/* FORMULAÇÃO: fill proporcional à meta (cor escolhida) */}
          {formActive && formHeight > 0 && (
            <g clipPath={`url(#innerClip${id})`}>
              {fillBody(formTop, formHeight, refColor)}
              {BUBBLES.map((b, i) => (
                <circle
                  key={`form-bubble-${i}`}
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

          {/* Borda do tanque */}
          <path d={TANK_PATH} fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth={2} />

          {/* Régua: litros (esq) + % (dir) */}
          <g>
            <line x1={238} y1={90} x2={238} y2={440} stroke="rgba(255,255,255,0.2)" strokeWidth={1} strokeDasharray="5,5" />
            {TIERS.map((p) => {
              const y = rulerY(p);
              const value = Math.round((capacity * p) / 100);
              return (
                <g key={p}>
                  <line x1={76} y1={y} x2={85} y2={y} stroke="rgba(255,255,255,0.6)" strokeWidth={1.5} />
                  <text x={72} y={y + 3.5} fill="#cbd5e1" fontSize={10} fontFamily="monospace" fontWeight={600} textAnchor="end">
                    {value.toLocaleString('pt-BR')}
                  </text>
                  <line x1={238} y1={y} x2={247} y2={y} stroke="rgba(255,255,255,0.6)" strokeWidth={1.5} />
                  <text x={251} y={y + 3.5} fill="#94a3b8" fontSize={10} fontFamily="monospace">
                    {p} %
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
        {/* Lavagem CIP: spray ball 360° sobre o balão vazio */}
        {cipWashing && <SprayBall360 />}
        {/* Formulação: cano no topo + produto descendo */}
        {formActive && (
          <div className="spray360" aria-hidden="true">
            <div className="form-pipe" />
            {formulation.running && !formulation.done && formStreamH > 2 && (
              <div
                className="form-stream"
                style={{
                  left: 'calc(50% - 5px)',
                  top: '22%',
                  width: 10,
                  height: `${formStreamH}%`,
                  background: `repeating-linear-gradient(to bottom, ${refColor} 0 12px, ${refColor}66 12px 20px)`,
                  boxShadow: `0 0 10px ${refColor}`,
                }}
              />
            )}
            {!formulation.done && (
              <div className="form-tag">
                <span>🧪 {Math.floor(formPct * 100)}%</span>
              </div>
            )}
          </div>
        )}
        </div>
      </div>

      {/* Caixa de valor estilo painel HMI sobre a base do tanque */}
      <div className="w-3/4 -mt-12 relative z-10 mx-auto text-center px-4 py-2 rounded-lg bg-[#0a0f16] border border-slate-600/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_4px_12px_rgba(0,0,0,0.5)]">
        <p className="text-2xl font-bold font-mono text-white tabular-nums">
          {boxEmpty ? 'VAZIO' : `${fmtL1(boxVolume)} L`}
        </p>
        <p className="text-sm font-mono font-bold text-cyan-300 tabular-nums">
          {boxEmpty ? '0%' : `${boxPct.toFixed(1)}%`}
        </p>
      </div>

      {/* Barra de estado */}
      <div className="w-full flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/50 border border-slate-700/40">
        <span className={`w-1.5 h-1.5 rounded-full ${stateBar.dot} animate-pulse`} />
        <span className="text-[11px] font-bold tracking-wider text-slate-300">{stateBar.text}</span>
      </div>

      {/* Nível (barra fina) */}
      <div className="w-full flex items-center gap-2">
        <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden relative">
          <motion.div
            className="h-full rounded-full relative overflow-hidden"
            style={{
              background: boxEmpty
                ? 'linear-gradient(90deg, transparent, transparent)'
                : `linear-gradient(90deg, ${barColor}AA, ${barColor}, ${barColor}AA)`,
              width: `${boxPct}%`,
              boxShadow: boxEmpty ? 'none' : `0 0 20px ${formActive ? refColor : product.glowColor}`,
            }}
            animate={{ width: `${boxPct}%` }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          >
            {!boxEmpty && boxPct > 10 && (
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-glow-pulse" />
            )}
          </motion.div>
        </div>
        {isEmpty && !formActive && (
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

      {/* Cronômetros da formulação (ao vivo; também aparece na leitura) */}
      {formActive && (
        <div className="w-full px-3 py-2 rounded-xl bg-violet-500/10 border border-violet-500/25 tabular-nums">
          {formulation.done ? (
            <div className="text-center">
              <p className="text-emerald-300 text-sm font-bold">✅ FORMULAÇÃO CONCLUÍDA</p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Tempo total: <span className="font-mono font-bold text-white">{formatHMS(formTotal)}</span>
              </p>
            </div>
          ) : (
            <>
              <p className="text-center text-violet-200 text-sm font-bold">
                🧪 {(RECIPES.find((r) => r.id === formulation.recipe) || {}).name || 'Formulação'} · {refProductName}
              </p>
              <div className="mt-1.5 space-y-1 text-[11px]">
                <div className="flex justify-between gap-2 text-slate-400">
                  <span>Meta da receita:</span>
                  <span className="font-mono font-bold text-white">{fmtL1(formTarget)} L</span>
                </div>
                <div className="flex justify-between gap-2 text-slate-400">
                  <span>Restam formular:</span>
                  <span className="font-mono font-bold text-amber-300">{fmtL1(formRemaining)} L</span>
                </div>
                <div className="flex justify-between gap-2 text-slate-400">
                  <span>Tempo previsto:</span>
                  <span className="font-mono font-bold text-white">{formatHMS(formTotal)}</span>
                </div>
                <div className="flex justify-between gap-2 text-slate-400">
                  <span>Decorrido:</span>
                  <span className="font-mono font-bold text-white">{formatHMS(formElapsed)}</span>
                </div>
                <div className="flex justify-between gap-2 text-slate-400">
                  <span>Restante:</span>
                  <span className="font-mono font-bold text-white">{formatHMS(formTotal - formElapsed)}</span>
                </div>
              </div>
              <div className="mt-1.5 h-2 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-400 transition-[width] duration-1000 ease-linear"
                  style={{ width: `${formPct * 100}%` }}
                />
              </div>
              <p className="text-center text-xs font-mono font-bold text-white mt-1">
                {Math.floor(formPct * 100)}%
              </p>
            </>
          )}
        </div>
      )}

      {/* Término previsto FIXO (horário de Brasília) */}
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
            🕐 {cipWashStartAt ? fmtHM(cipWashStartAt) : '--:--'} → {cipWashEndsAt ? fmtHM(cipWashEndsAt) : '--:--'} · faltam {formatClockMS((cipWashEndsAt || 0) - nowTick)}
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
            🔴 VAZIO — Aguardando abastecimento
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
            ⚠ NÍVEL BAIXO — restam {fmtL1(currentVolume)} L
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Balloon;
