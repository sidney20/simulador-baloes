'use client';

import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { PRODUCTS, MACHINES } from '../constants';
import { flowRatePerHourForIds, machineFlowRate, percentOf, machineMaxFlow, isCipValid, formatBrasiliaDateTime, formatClockMS } from '../simulation';
import { Volume2, Truck, RotateCcw, Square, Play, Pause, AlertTriangle, Sparkles, Check } from 'lucide-react';

// Exibe % com vírgula decimal (só exibição)
const fmtPct = (v) => String(v).replace('.', ',');

// Campo de % com texto livre por máquina: apaga, digita (aceita decimais),
// confirma no blur/Enter. App limita 0..100 sem arredondar.
const MachinePercentInput = ({ mid, value, onCommit, disabled }) => {
  const ref = useRef(null);
  const [text, setText] = useState(() => String(value));
  useEffect(() => {
    if (document.activeElement !== ref.current) setText(String(value));
  }, [value]);
  const commit = () => {
    const n = parseFloat(String(text).replace(',', '.'));
    if (!Number.isFinite(n)) {
      setText(String(value)); // inválido: volta ao atual
      return;
    }
    onCommit(mid, n);
  };
  return (
    <div className="relative w-24 shrink-0">
      <input
        ref={ref}
        type="number"
        min="0"
        max="100"
        step="any"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
        className="input-field no-spinner text-center font-mono"
        style={{ paddingLeft: 8, paddingRight: 26 }}
        placeholder="100"
        disabled={disabled}
      />
      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 text-xs">%</span>
    </div>
  );
};

const ControlPanel = ({
  id,
  name,
  capacity,
  currentVolume,
  setCurrentVolume,
  productId,
  setProductId,
  machines,
  machineIds,
  onToggleMachine,
  machineFlow,
  onMachinePercent,
  expectedAccum,
  isRunning,
  isEmpty,
  onPlay,
  onPause,
  onReset,
  onEmpty,
  initialVolume,
  sessionElapsedMs,
  cipHours,
  setCipHours,
  cipDoneAt,
  cipWashMinutes,
  setCipWashMinutes,
  cipWashing,
  cipWashEndsAt,
  onStartCipWash,
  onCancelCipWash,
}) => {
  const product = PRODUCTS.find(p => p.id === productId) || PRODUCTS[0];

  // Campos numéricos com texto livre: deixa apagar tudo e digitar,
  // só confirma (commit) ao sair do campo ou apertar Enter.
  const volRef = useRef(null);
  const cipRef = useRef(null);
  const washHRef = useRef(null);
  const washMRef = useRef(null);
  const [volText, setVolText] = useState(() => String(Math.round(currentVolume)));
  const [cipText, setCipText] = useState(() => String(cipHours ?? ''));
  // Duração da lavagem em horas + minutos (texto livre, confirma no blur/Enter)
  const splitWash = (total) => {
    const t = Math.max(0, Number(total) || 0);
    return { h: String(Math.floor(t / 60)), m: String(t % 60) };
  };
  const [washHText, setWashHText] = useState(() => splitWash(cipWashMinutes).h);
  const [washMText, setWashMText] = useState(() => splitWash(cipWashMinutes).m);

  useEffect(() => {
    if (document.activeElement !== volRef.current) {
      setVolText(String(Math.round(currentVolume)));
    }
  }, [currentVolume]);

  useEffect(() => {
    if (document.activeElement !== cipRef.current) {
      setCipText(String(cipHours ?? ''));
    }
  }, [cipHours]);

  useEffect(() => {
    const ae = document.activeElement;
    if (ae !== washHRef.current && ae !== washMRef.current) {
      const { h, m } = splitWash(cipWashMinutes);
      setWashHText(h);
      setWashMText(m);
    }
  }, [cipWashMinutes]);

  const commitVolume = () => {
    const n = parseInt(volText, 10);
    if (Number.isNaN(n)) {
      setVolText(String(Math.round(currentVolume))); // inválido: volta ao atual
      return;
    }
    const value = Math.max(0, Math.min(capacity, n));
    setVolText(String(value));
    setCurrentVolume(value);
  };

  const commitCipHours = () => {
    const n = parseInt(cipText, 10);
    if (Number.isNaN(n)) {
      setCipText(String(cipHours ?? '')); // inválido: volta ao atual
      return;
    }
    setCipHours(n); // App limita 1..720
  };

  const commitWashDuration = () => {
    const h = parseInt(washHText, 10);
    const m = parseInt(washMText, 10);
    const hh = Number.isNaN(h) ? 0 : Math.max(0, Math.min(12, h));
    const mm = Number.isNaN(m) ? 0 : Math.max(0, Math.min(59, m));
    const total = hh * 60 + mm;
    if (total < 1) {
      const { h: rh, m: rm } = splitWash(cipWashMinutes); // inválido: volta ao atual
      setWashHText(rh);
      setWashMText(rm);
      return;
    }
    setCipWashMinutes(total); // App limita 1..720
  };

  // Enter apenas tira o foco; a confirmação acontece no onBlur (caminho único)
  const blurOnEnter = (e) => {
    if (e.key === 'Enter') e.currentTarget.blur();
  };

  const handleQuickFill = (percent) => {
    const value = (capacity * percent) / 100; // exato, sem arredondar
    setVolText(String(value));
    setCurrentVolume(value);
  };

  const locked = isRunning || cipWashing; // envase rodando ou lavagem em curso
  const activeIds = Array.isArray(machineIds) ? machineIds : [];
  const pctOf = (mid) => percentOf(machineFlow, mid);
  const flowRate = flowRatePerHourForIds(activeIds, machineFlow); // total do balão em L/h
  const perMachineRate = (mid) => machineFlowRate(mid, machineFlow); // cada máquina em L/h
  const canStart = !isEmpty && currentVolume > 0 && machines > 0 && !cipWashing && flowRate > 0 && isCipValid(cipDoneAt, cipHours);
  const cipOk = isCipValid(cipDoneAt, cipHours);
  // Máquinas e % podem mudar COM o envase rodando (ETA recalcula na hora);
  // o resto trava durante envase/lavagem.
  const machineLocked = cipWashing;

  // Relógio ao vivo p/ contagem da lavagem
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const washRemainingMs = Math.max(0, (cipWashEndsAt || 0) - nowTick);

  const consumed = Math.max(0, (initialVolume || 0) - currentVolume);
  // Auditoria exata: acumulado tick a tick com a vazão vigente em cada tick
  // (correto mesmo com % mudando no meio do envase)
  const expected = Math.max(0, Number(expectedAccum) || 0);
  const fmt1 = (v) => v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const fmtClock = (ms) => {
    const s = Math.floor((ms || 0) / 1000);
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  };

  return (
    <motion.div
      className="glass-panel p-4 sm:p-5 space-y-4 sm:space-y-5 min-w-0"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: id * 0.1 }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
          <Volume2 className="w-5 h-5 text-blue-400 shrink-0" />
          Controles - {name}
        </h4>
        <div className="flex items-center gap-2">
          <span className={`px-2 py-1 rounded-full text-xs font-bold ${
            isRunning ? 'bg-green-600/30 text-green-400 border border-green-500/30' :
            isEmpty ? 'bg-red-600/30 text-red-400 border border-red-500/30' :
            'bg-slate-600/30 text-slate-400 border border-slate-500/30'
          }`}>
            {isRunning ? 'RODANDO' : isEmpty ? 'VAZIO' : 'PARADO'}
          </span>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2 flex items-center gap-2">
            <Truck className="w-4 h-4 text-slate-400" />
            Produto no Balão
          </label>
          <select
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            className="select-field"
            disabled={locked}
          >
            {PRODUCTS.map(p => (
              <option key={p.id} value={p.id} style={{ backgroundColor: '#1e293b', color: p.isEmpty ? '#ef4444' : 'white' }}>
                {p.name} {p.isEmpty && '(VAZIO)'}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-3 mt-2">
            <div 
              className="w-8 h-8 rounded-lg border-2 border-slate-600 relative overflow-hidden flex-shrink-0"
              style={{ 
                background: product.isEmpty 
                  ? 'repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(255,255,255,0.05) 10px, rgba(255,255,255,0.05) 20px)'
                  : `linear-gradient(135deg, ${product.color}CC, ${product.color}88, ${product.color}CC)`
              }}
            >
              {!product.isEmpty && (
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-glow-pulse" />
              )}
            </div>
            <span className="text-sm text-slate-300 capitalize">{product.name.toLowerCase()}</span>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2 flex items-center gap-2">
            <RotateCcw className="w-4 h-4 text-slate-400" />
            Quantidade Atual (Litros)
          </label>
          <div className="relative">
            <input
              ref={volRef}
              type="number"
              min="0"
              max={capacity}
              value={volText}
              onChange={(e) => setVolText(e.target.value)}
              onBlur={commitVolume}
              onKeyDown={blurOnEnter}
              className="input-field no-spinner pr-12 text-right font-mono text-lg"
              placeholder="0"
              disabled={locked}
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 font-mono text-sm">
              L
            </span>
          </div>
          <div className="flex gap-2 mt-3">
            {[25, 50, 75, 100].map(p => (
              <button
                key={p}
                onClick={() => handleQuickFill(p)}
                disabled={locked}
                className="flex-1 px-3 py-2 text-xs font-medium rounded-xl transition-all duration-200
                  bg-slate-800/50 hover:bg-slate-700/50 text-slate-300
                  border border-slate-600/50 hover:border-slate-500
                  disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {p}%
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-500 mt-1">Capacidade máxima: {capacity.toLocaleString()} L</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2 flex items-center gap-2">
            <Square className="w-4 h-4 text-slate-400" />
            Máquinas Envasadoras
          </label>
          <div className="grid grid-cols-3 gap-2">
            {MACHINES.map((m) => {
              const active = (machineIds || []).includes(m.id);
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => onToggleMachine(m.id)}
                  disabled={machineLocked}
                  title={locked ? 'Travado durante envase ou lavagem' : `Ligar/desligar ${m.name} (máx. ${m.maxFlow.toLocaleString('pt-BR')} L/h)`}
                  className={`px-2 py-2 rounded-xl transition-all duration-200 border flex flex-col items-center justify-center gap-0.5
                    disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.97]
                    ${active
                      ? 'bg-cyan-600/30 border-cyan-400/70 text-white shadow-lg shadow-cyan-600/20'
                      : 'bg-slate-800/50 border-slate-600/50 text-slate-300 hover:border-slate-500'}`}
                >
                  <span className="text-xs sm:text-sm font-bold flex items-center gap-1.5">
                    {active && <Check className="w-3.5 h-3.5 shrink-0" />}
                    {m.name}
                  </span>
                  <span className="text-[10px] font-mono opacity-70 tabular-nums">
                    máx {m.maxFlow.toLocaleString('pt-BR')} L/h
                  </span>
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-slate-500 mt-1.5">
            Máx. 2 por balão · SIG-03 UHT opera sempre sozinha
          </p>

          <div className="mt-3 space-y-3">
            <p className="block text-sm font-medium text-slate-300">
              Vazão por máquina (% individual)
            </p>
            {activeIds.length === 0 && (
              <p className="text-xs text-slate-500">Nenhuma máquina ligada — selecione acima.</p>
            )}
            {activeIds.map((mid) => (
              <div key={mid} className="p-2.5 rounded-xl bg-slate-800/40 border border-slate-700/40">
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="text-sm font-bold text-white">{mid}</span>
                  <span className="text-[11px] font-mono text-slate-400 tabular-nums">
                    máx {machineMaxFlow(mid).toLocaleString('pt-BR')} L/h
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    value={Math.max(0, Math.min(100, Number(pctOf(mid)) || 0))}
                    onChange={(e) => onMachinePercent(mid, Number(e.target.value))}
                    className="flex-1 min-w-0 accent-cyan-400 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={machineLocked}
                    aria-label={`Porcentagem da ${mid}`}
                  />
                  <MachinePercentInput
                    mid={mid}
                    value={pctOf(mid)}
                    onCommit={onMachinePercent}
                    disabled={machineLocked}
                  />
                </div>
                <p className="text-xs text-cyan-300 font-mono tabular-nums mt-1">
                  {fmtPct(pctOf(mid))}% — {perMachineRate(mid).toLocaleString('pt-BR')} L/h
                </p>
              </div>
            ))}
            {activeIds.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-slate-500 shrink-0">Todas:</span>
                <div className="flex gap-2 flex-1">
                  {[25, 50, 75, 100].map(p => (
                    <button
                      key={p}
                      onClick={() => activeIds.forEach((mid) => onMachinePercent(mid, p))}
                      disabled={machineLocked}
                      className="flex-1 px-2 py-1.5 text-xs font-medium rounded-xl transition-all duration-200
                        bg-slate-800/50 hover:bg-slate-700/50 text-slate-300
                        border border-slate-600/50 hover:border-slate-500
                        disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {p}%
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="mt-2 p-3 bg-slate-800/50 rounded-xl border border-slate-700/50">
            {activeIds.map((mid) => (
              <div key={mid} className="flex flex-wrap justify-between gap-x-2 text-sm tabular-nums mt-1 first:mt-0">
                <span className="text-slate-400">{mid} ({fmtPct(pctOf(mid))}%):</span>
                <span className="font-mono font-bold text-white">{perMachineRate(mid).toLocaleString('pt-BR')} L/h</span>
              </div>
            ))}
            <p className="text-xl font-bold font-mono text-white tabular-nums mt-1">
              Vazão total: {flowRate.toLocaleString('pt-BR')} L/h
              {flowRate > 0 && (
                <span className="text-sm text-slate-400 font-normal"> ({fmt1(flowRate / 60)} L/min)</span>
              )}
            </p>
            <p className="text-[11px] text-slate-500">
              Capacidade estimada total do balão ({activeIds.length > 0 ? activeIds.join(' + ') : 'nenhuma'})
            </p>
            {initialVolume > 0 && (
              <div className="mt-2 pt-2 border-t border-slate-700/50 text-xs tabular-nums">
                <div className="flex flex-wrap justify-between gap-x-2 text-slate-400">
                  <span>⏱ Tempo de sessão:</span>
                  <span className="font-mono font-bold text-white">{fmtClock(sessionElapsedMs)}</span>
                </div>
                <div className="flex flex-wrap justify-between gap-x-2 text-slate-400 mt-1">
                  <span>📐 Esperado (acumulado):</span>
                  <span className="font-mono font-bold text-cyan-300">{fmt1(expected)} L</span>
                </div>
                <div className="flex flex-wrap justify-between gap-x-2 text-slate-400 mt-1">
                  <span>📉 Consumido real:</span>
                  <span className="font-mono font-bold text-amber-300">{fmt1(consumed)} L</span>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="pt-2 border-t border-slate-700/30">
          <label className="block text-sm font-medium text-slate-300 mb-2 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-slate-400" />
            CIP — Higiene do balão
          </label>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="text-[11px] text-slate-500 mb-1">Validade (horas)</p>
              <div className="relative">
                <input
                  ref={cipRef}
                  type="number"
                  min="1"
                  max="720"
                  value={cipText}
                  onChange={(e) => setCipText(e.target.value)}
                  onBlur={commitCipHours}
                  onKeyDown={blurOnEnter}
                  className="input-field no-spinner pr-9 text-right font-mono"
                  placeholder="72"
                  disabled={locked}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">h</span>
              </div>
            </div>
            <div>
              <p className="text-[11px] text-slate-500 mb-1">Lavagem (h + min)</p>
              <div className="flex gap-1.5">
                <div className="relative flex-1 min-w-0">
                  <input
                    ref={washHRef}
                    type="number"
                    min="0"
                    max="12"
                    value={washHText}
                    onChange={(e) => setWashHText(e.target.value)}
                    onBlur={commitWashDuration}
                    onKeyDown={blurOnEnter}
                    className="input-field no-spinner text-center font-mono"
                    style={{ paddingLeft: 8, paddingRight: 22 }}
                    placeholder="0"
                    disabled={locked}
                  />
                  <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-500 text-[11px]">h</span>
                </div>
                <div className="relative flex-1 min-w-0">
                  <input
                    ref={washMRef}
                    type="number"
                    min="0"
                    max="59"
                    value={washMText}
                    onChange={(e) => setWashMText(e.target.value)}
                    onBlur={commitWashDuration}
                    onKeyDown={blurOnEnter}
                    className="input-field no-spinner text-center font-mono"
                    style={{ paddingLeft: 8, paddingRight: 30 }}
                    placeholder="30"
                    disabled={locked}
                  />
                  <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-500 text-[11px]">min</span>
                </div>
              </div>
            </div>
          </div>
          <p className="text-xs text-slate-500 mt-1 tabular-nums">
            {cipDoneAt
              ? `Último CIP: ${formatBrasiliaDateTime(new Date(cipDoneAt))}`
              : 'Nenhum CIP realizado ainda'}
          </p>
          {cipWashing ? (
            <div className="mt-2">
              <p className="text-center text-sky-200 text-sm font-bold tabular-nums animate-pulse">
                🛁 Lavando... faltam {formatClockMS(washRemainingMs)}
              </p>
              <button
                onClick={onCancelCipWash}
                className="btn-danger w-full mt-2 flex items-center justify-center gap-2 max-sm:px-3 max-sm:text-sm"
              >
                INTERROMPER LAVAGEM
              </button>
            </div>
          ) : (
            <button
              onClick={onStartCipWash}
              disabled={locked || !isEmpty}
              className="btn-success w-full mt-2 flex items-center justify-center gap-2 max-sm:px-3 max-sm:text-sm"
            >
              <Sparkles className="w-4 h-4 shrink-0" />
              INICIAR LAVAGEM CIP
            </button>
          )}
          {!cipWashing && !isEmpty && (
            <p className="text-[11px] text-slate-500 mt-1 text-center">
              Esvazie o balão para liberar a lavagem
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2 sm:gap-3 pt-2 border-t border-slate-700/30">
          <button
            onClick={onPlay}
            disabled={isRunning || !canStart}
            className="btn-primary flex-1 flex items-center justify-center gap-2 max-sm:px-3 max-sm:text-sm"
          >
            <Play className="w-4 h-4 shrink-0" />
            INICIAR
          </button>
          <button
            onClick={onPause}
            disabled={!isRunning}
            className="btn-secondary flex-1 flex items-center justify-center gap-2 max-sm:px-3 max-sm:text-sm"
          >
            <Pause className="w-4 h-4 shrink-0" />
            PAUSAR
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:gap-3">
          <button
            onClick={onReset}
            disabled={locked}
            className="btn-secondary flex-1 flex items-center justify-center gap-2 max-sm:px-3 max-sm:text-sm"
          >
            <RotateCcw className="w-4 h-4 shrink-0" />
            RESETAR
          </button>
          <button
            onClick={onEmpty}
            disabled={locked || isEmpty}
            className="btn-danger flex-1 flex items-center justify-center gap-2 max-sm:px-3 max-sm:text-sm"
          >
            <AlertTriangle className="w-4 h-4 shrink-0" />
            ESVAZIAR
          </button>
        </div>

        {isEmpty && !isRunning && (
          <motion.p
            className="text-center text-red-400 text-sm p-3 bg-red-600/10 border border-red-500/20 rounded-xl"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            ⚠ Abasteça o balão para iniciar a simulação
          </motion.p>
        )}
        {!isEmpty && machines <= 0 && !isRunning && (
          <motion.p
            className="text-center text-amber-300 text-sm p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            ⚠ Selecione 1 ou 2 máquinas puxando para liberar o INICIAR
          </motion.p>
        )}
        {!isEmpty && machines > 0 && flowRate <= 0 && !isRunning && (
          <motion.p
            className="text-center text-amber-300 text-sm p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            ⚠ Vazão em 0% — aumente a porcentagem para liberar o INICIAR
          </motion.p>
        )}
        {!isEmpty && machines > 0 && !cipOk && !isRunning && (
          <motion.p
            className="text-center text-red-300 text-sm p-3 bg-red-600/10 border border-red-500/25 rounded-xl"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            🛁 CIP vencido ou pendente — faça a lavagem CIP para liberar o INICIAR
          </motion.p>
        )}
      </div>
    </motion.div>
  );
};

export default ControlPanel;