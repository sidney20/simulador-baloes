'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  PRODUCTS,
  BALLOON_CONFIG,
  toggleMachineIds,
  normalizeMachineIds,
  STORAGE_KEY,
  LOW_LEVEL_THRESHOLD,
  DEFAULT_CIP_HOURS,
  DEFAULT_CIP_WASH_MINUTES
} from './constants';
import Balloon from './components/Balloon';
import ControlPanel from './components/ControlPanel';
import Dashboard from './components/Dashboard';
import ShareModal from './components/ShareModal';
import PublicView from './components/PublicView';
import { calculateConsumptionForIds, calculateFixedEtaForIds, isCipValid, flowRatePerHourForIds, sanitizeMachineFlowMap, formElapsedMs, recipeDurationMs, hasFormSession } from './simulation';
import { isSupabaseEnabled } from './supabaseClient';
import { fetchRemoteBalloons, pushRemoteBalloons } from './sync';
import { 
  Volume2, 
  AlertTriangle, 
  Info, 
  Settings, 
  HardDrive, 
  RefreshCw,
  VolumeX,
  Volume2 as Speaker,
  Share2
} from 'lucide-react';

/** Rota pública somente leitura: #/acompanhar/:token */
function getPublicToken() {
  const m = window.location.hash.match(/^#\/acompanhar\/([A-Za-z0-9_-]+)/);
  return m ? m[1] : null;
}

const getInitialBalloons = () => BALLOON_CONFIG.map(b => ({
  id: b.id,
  name: b.name,
  capacity: b.capacity,
  currentVolume: 0,
  initialVolume: 0,
  productId: 'vazio',
  machineIds: [],
  machineFlow: {},
  expectedAccum: 0,
  isRunning: false,
  sessionStart: null,
  sessionAccum: 0,
  // ETA travada (estimated_finish_at): calculada UMA vez no PLAY, nunca no tick
  estimatedFinishAt: null,
  pausedAt: null,
  totalPausedMs: 0,
  // CIP (limpeza): validade configurável em horas + momento da realização
  cipHours: DEFAULT_CIP_HOURS,
  cipDoneAt: null,
  // Lavagem CIP (spray ball): dura cipWashMinutes com o balão vazio
  cipWashing: false,
  cipWashEndsAt: null,
  cipWashMinutes: DEFAULT_CIP_WASH_MINUTES,
  // FORMULAÇÃO DO PRODUTO: receita + cronômetro próprio + produto a formular
  // (padrão = produto do Balão 03; pode escolher outro por balão)
  formRecipe: null,
  formRunning: false,
  formStartAt: null,
  formAccumMs: 0,
  formDone: false,
  formProductId: null,
  formTargetLiters: 0,
}));

const App = () => {
  // Rota pública somente leitura: #/acompanhar/:token (sem controles)
  const [publicToken, setPublicToken] = useState(() => getPublicToken());
  useEffect(() => {
    const onHash = () => setPublicToken(getPublicToken());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const [shareOpen, setShareOpen] = useState(false);

  // Leitura do LocalStorage com timestamp (formato atual:
  // { version, savedAt, balloons }; formato legado: array direto).
  const readStorage = () => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return null;
      const raw = JSON.parse(saved);
      if (Array.isArray(raw)) return { balloons: raw, savedAt: null };
      if (raw && Array.isArray(raw.balloons)) {
        return { balloons: raw.balloons, savedAt: raw.savedAt || null };
      }
    } catch {
      // ignora e usa o estado inicial
    }
    return null;
  };

  const mergeWithConfig = (parsed) => {
    if (!Array.isArray(parsed) || parsed.length !== BALLOON_CONFIG.length) {
      return getInitialBalloons();
    }
    // Mescla o estado salvo com a configuração atual:
    // capacidade/nome vêm do código, volumes e seleções são preservados
    return BALLOON_CONFIG.map(cfg => {
      const s = parsed.find(p => p && p.id === cfg.id) || {};
      const currentVolume = Math.max(0, Math.min(Number(s.currentVolume) || 0, cfg.capacity));
      const ids = normalizeMachineIds(s.machineIds ?? s.machines);
      return {
        id: cfg.id,
        name: cfg.name,
        capacity: cfg.capacity,
        currentVolume,
        initialVolume: Math.max(0, Math.min(Number(s.initialVolume) || 0, cfg.capacity)),
              productId: typeof s.productId === 'string' ? s.productId : 'vazio',
              machineIds: ids,
              machineFlow: sanitizeMachineFlowMap(s.machineFlow ?? s.flowPercent, ids),
              expectedAccum: 0,
          isRunning: false,
          sessionStart: null,
          sessionAccum: 0,
          estimatedFinishAt: typeof s.estimatedFinishAt === 'number' ? s.estimatedFinishAt : null,
          pausedAt: null,
          totalPausedMs: Number(s.totalPausedMs) || 0,
          cipHours: Number(s.cipHours) > 0 ? Number(s.cipHours) : DEFAULT_CIP_HOURS,
          cipDoneAt: typeof s.cipDoneAt === 'number' ? s.cipDoneAt : null,
          cipWashing: s.cipWashing === true,
          cipWashEndsAt: typeof s.cipWashEndsAt === 'number' ? s.cipWashEndsAt : null,
          cipWashMinutes: Number(s.cipWashMinutes) > 0 ? Number(s.cipWashMinutes) : DEFAULT_CIP_WASH_MINUTES,
          formRecipe: s.formRecipe === 'grande' ? 'grande' : s.formRecipe === 'normal' ? 'normal' : null,
          formRunning: s.formRunning === true,
          formStartAt: typeof s.formStartAt === 'number' ? s.formStartAt : null,
          formAccumMs: Math.max(0, Number(s.formAccumMs) || 0),
          formDone: false, // concluída vira litros no balão (ver conclusão)
          formProductId: PRODUCTS.some(p => p.id === s.formProductId && !p.isEmpty) ? s.formProductId : null,
          formTargetLiters: Math.max(0, Math.min(cfg.capacity, Number(s.formTargetLiters) || 0)),
        };
      });
    };

  const [savedAt, setSavedAt] = useState(() => readStorage()?.savedAt ?? null);
  const [balloons, setBalloons] = useState(() => mergeWithConfig(readStorage()?.balloons));
  const [isRunning, setIsRunning] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [showToast, setShowToast] = useState({ visible: false, message: '', type: 'info' });
  const audioContextRef = useRef(null);
  // Espelho do estado p/ o loop de simulação ler sempre o valor mais recente
  // sem recriar o loop a cada render (o que zerava o delta de tempo).
  const balloonsRef = useRef(balloons);
  useEffect(() => {
    balloonsRef.current = balloons;
  }, [balloons]);

  // Persistência com timestamp: salva níveis exatos (float completo,
  // sem arredondar) + momento do salvamento p/ não perder precisão.
  useEffect(() => {
    const now = Date.now();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, savedAt: now, balloons }));
      setSavedAt(now);
    } catch {
      // armazenamento indisponível: segue sem persistir
    }
  }, [balloons]);

  // Nuvem (Supabase): na abertura, a nuvem vence o local; depois, sobe
  // com throttle (last-writer-wins). O push só libera DEPOIS do fetch
  // (senão um recém-instalado subiria zeros por cima dos dados reais).
  // Sem config = só LocalStorage.
  const pushTimer = useRef(null);
  const [cloudReady, setCloudReady] = useState(!isSupabaseEnabled);
  useEffect(() => {
    if (!isSupabaseEnabled) return;
    let cancelled = false;
    fetchRemoteBalloons()
      .then((remote) => {
        if (cancelled) return;
        if (remote && remote.length > 0) {
          setBalloons((prev) =>
            BALLOON_CONFIG.map((cfg) => remote.find((r) => r.id === cfg.id) || prev.find((b) => b.id === cfg.id))
          );
          showNotification('☁️ Dados sincronizados da nuvem', 'info');
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setCloudReady(true);
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Nuvem: throttle de ~1s (envio contínuo, inclusive rodando).
  // Debounce puro nunca dispararia com o envase ativo (muda a cada 1s).
  const lastPush = useRef(0);
  useEffect(() => {
    if (!isSupabaseEnabled || !cloudReady) return;
    const doPush = () => {
      lastPush.current = Date.now();
      pushRemoteBalloons(balloonsRef.current).catch(() => {});
    };
    if (Date.now() - lastPush.current >= 1000) {
      doPush();
    } else {
      if (pushTimer.current) clearTimeout(pushTimer.current);
      pushTimer.current = setTimeout(doPush, 1000 - (Date.now() - lastPush.current));
    }
    return () => {
      if (pushTimer.current) clearTimeout(pushTimer.current);
    };
  }, [balloons, cloudReady]);

  const playAlertSound = useCallback(() => {
    if (!soundEnabled) return;
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }
      const ctx = audioContextRef.current;
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      oscillator.frequency.setValueAtTime(800, ctx.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(400, ctx.currentTime + 0.5);
      gainNode.gain.setValueAtTime(0.1, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.5);
    } catch (e) {
      console.log('Audio not available');
    }
  }, [soundEnabled]);

  const showNotification = (message, type = 'info') => {
    setShowToast({ visible: true, message, type });
    setTimeout(() => setShowToast(v => ({ ...v, visible: false })), 3000);
  };

  const updateBalloon = (id, updates) => {
    setBalloons(prev => prev.map(b =>
      b.id === id ? { ...b, ...updates } : b
    ));
  };

  // Quantidade de máquinas ligadas no balão (nomes em machineIds)
  const machineCountOf = (b) => (b?.machineIds || []).length;

  const handlePlay = (id) => {
    const balloon = balloons.find(b => b.id === id);
    if (balloon?.cipWashing) {
      showNotification('Lavagem CIP em andamento — aguarde concluir', 'warning');
      return;
    }
    if (hasFormSession({ recipe: balloon?.formRecipe, running: balloon?.formRunning, startAt: balloon?.formStartAt, accumMs: balloon?.formAccumMs, done: balloon?.formDone })) {
      showNotification('Formulação ativa — conclua ou limpe (NOVA FORMULAÇÃO) para envasar', 'warning');
      return;
    }
    if (!balloon || balloon.currentVolume <= 0 || balloon.productId === 'vazio') {
      showNotification('Abasteça o balão para iniciar', 'warning');
      return;
    }
    if (machineCountOf(balloon) <= 0) {
      showNotification('Selecione as máquinas puxando para iniciar o envase', 'warning');
      return;
    }
    if (!(flowRatePerHourForIds(balloon.machineIds, balloon.machineFlow) > 0)) {
      showNotification('Vazão em 0% — aumente a porcentagem da vazão para iniciar', 'warning');
      return;
    }
    if (!isCipValid(balloon.cipDoneAt, balloon.cipHours)) {
      showNotification('CIP vencido ou pendente — faça a lavagem CIP antes de iniciar', 'warning');
      return;
    }
    // ETA TRAVADA: calculada UMA vez aqui no PLAY a partir do nível atual.
    // Continuar após pausa recalcula do nível congelado (equivale a somar o
    // tempo pausado à ETA antiga). O tick de 1s NUNCA recalcula a ETA.
    const now = Date.now();
    const freshSession = !balloon.sessionStart && !(balloon.sessionAccum > 0);
    updateBalloon(id, {
      isRunning: true,
      sessionStart: now,
      ...(freshSession ? { initialVolume: balloon.currentVolume, sessionAccum: 0, expectedAccum: 0 } : {}),
      estimatedFinishAt: calculateFixedEtaForIds(balloon.currentVolume, balloon.machineIds, now, balloon.machineFlow),
      totalPausedMs: (balloon.totalPausedMs || 0) + (balloon.pausedAt ? now - balloon.pausedAt : 0),
      pausedAt: null,
    });
    setIsRunning(true);
    showNotification(`${balloon.name} iniciado`, 'success');
  };

  const handlePause = (id) => {
    const now = Date.now();
    const balloon = balloons.find(b => b.id === id);
    updateBalloon(id, {
      isRunning: false,
      sessionAccum: (balloon?.sessionAccum || 0) + (balloon?.sessionStart ? now - balloon.sessionStart : 0),
      sessionStart: null,
      // Congela o tempo: ETA travada é mantida, marca quando pausou
      pausedAt: balloon?.isRunning ? now : (balloon?.pausedAt ?? null),
    });
    const anyRunning = balloons.some(b => b.id !== id && b.isRunning);
    setIsRunning(anyRunning);
    showNotification(`${balloon?.name || 'Balão'} pausado`, 'info');
  };

  const handleReset = (id) => {
    const balloon = balloons.find(b => b.id === id);
    updateBalloon(id, {
      currentVolume: balloon.initialVolume,
      isRunning: false,
      sessionAccum: 0,
      sessionStart: null,
      expectedAccum: 0,
      estimatedFinishAt: null,
      pausedAt: null,
    });
    showNotification(`${balloon?.name || 'Balão'} resetado para ${balloon.initialVolume.toLocaleString()} L`, 'info');
  };

  const handleEmpty = (id) => {
    updateBalloon(id, {
      currentVolume: 0,
      initialVolume: 0,
      isRunning: false,
      productId: 'vazio',
      sessionAccum: 0,
      sessionStart: null,
      expectedAccum: 0,
      estimatedFinishAt: null,
      pausedAt: null,
      totalPausedMs: 0,
    });
    playAlertSound();
    showNotification(`${balloons.find(b => b.id === id)?.name || 'Balão'} esvaziado`, 'warning');
  };

  const handleVolumeChange = (id, volume) => {
    const current = balloons.find(b => b.id === id);
    const cappedVolume = Math.max(0, Math.min(volume, current?.capacity || 0));
    let productId = current?.productId || 'creme-leve';
    if (cappedVolume === 0) {
      productId = 'vazio';
    } else if (productId === 'vazio') {
      // Digitou volume num balão vazio: assume Creme Leve p/ liberar o INICIAR
      productId = 'creme-leve';
      showNotification(`${current?.name || 'Balão'} abastecido com Creme Leve`, 'info');
    }
    // Abastecimento manual = nova sessão (nova baseline e cronômetro zerado)
    updateBalloon(id, {
      currentVolume: cappedVolume,
      initialVolume: cappedVolume,
      productId,
      sessionAccum: 0,
      sessionStart: null,
      expectedAccum: 0,
      estimatedFinishAt: null,
      pausedAt: null,
      totalPausedMs: 0,
    });
  };

  const handleProductChange = (id, productId) => {
    updateBalloon(id, { productId });
    if (productId === 'vazio') {
      updateBalloon(id, {
        currentVolume: 0,
        initialVolume: 0,
        isRunning: false,
        estimatedFinishAt: null,
        pausedAt: null,
      });
    }
    showNotification(`Produto alterado para ${PRODUCTS.find(p => p.id === productId)?.name}`, 'info');
  };

  // Recalcula a ETA a partir do nível ATUAL + vazão ATUAL (preserva o
  // histórico: o já consumido não entra na conta, só o restante).
  const recalcEtaNow = (balloon, machineIds, machineFlow, now) => {
    const flow = flowRatePerHourForIds(machineIds, machineFlow);
    return flow > 0 && balloon.currentVolume > 0
      ? now + (balloon.currentVolume / flow) * 3600000
      : null;
  };

  // Pausa o balão quando ele fica sem vazão (sem máquinas ou 0% em todas).
  // Evita o estado zumbi "ENVASE ATIVO - 0 L/h".
  const autoPauseNoFlow = (id, balloon, now) => {
    updateBalloon(id, {
      isRunning: false,
      sessionAccum: (balloon.sessionAccum || 0) + (balloon.sessionStart ? now - balloon.sessionStart : 0),
      sessionStart: null,
      pausedAt: now,
    });
    const anyRunning = balloons.some(b => b.id !== id && b.isRunning);
    setIsRunning(anyRunning);
    showNotification('Sem vazão ativa — envase pausado', 'warning');
  };

  const handleMachineToggle = (id, mid) => {
    const balloon = balloons.find(b => b.id === id);
    if (!balloon || balloon.cipWashing) return;
    const before = balloon.machineIds || [];
    const next = toggleMachineIds(before, mid);
    // Garante % padrão 100 p/ máquina recém-ligada
    const machineFlow = { ...(balloon.machineFlow || {}) };
    next.forEach((mid2) => {
      if (!Number.isFinite(Number(machineFlow[mid2]))) machineFlow[mid2] = 100;
    });
    const now = Date.now();
    if (balloon.isRunning && !(flowRatePerHourForIds(next, machineFlow) > 0)) {
      updateBalloon(id, { machineIds: next, machineFlow });
      autoPauseNoFlow(id, balloon, now);
      return;
    }
    updateBalloon(id, {
      machineIds: next,
      machineFlow,
      // Rodando: ETA recalcula na hora do restante; parado: recalcula no PLAY
      estimatedFinishAt: balloon.isRunning
        ? recalcEtaNow(balloon, next, machineFlow, now)
        : null,
    });
    if (mid === 'SIG-03' && next.includes('SIG-03') && !before.includes('SIG-03')) {
      showNotification('SIG-03 UHT opera sempre sozinha', 'info');
    } else if (before.includes('SIG-03') && !next.includes('SIG-03')) {
      showNotification('SIG-03 UHT desligada', 'info');
    }
  };

  const handleMachinePercentChange = (id, mid, percent) => {
    const v = Number(percent);
    if (!Number.isFinite(v)) return; // inválido: painel reverte o texto
    // Aceita qualquer porcentagem (inclusive decimais), sem arredondar
    const balloon = balloons.find(b => b.id === id);
    if (!balloon || balloon.cipWashing) return;
    const machineFlow = { ...(balloon.machineFlow || {}), [mid]: Math.max(0, Math.min(100, v)) };
    const now = Date.now();
    if (balloon.isRunning && !(flowRatePerHourForIds(balloon.machineIds, machineFlow) > 0)) {
      updateBalloon(id, { machineFlow });
      autoPauseNoFlow(id, balloon, now);
      return;
    }
    updateBalloon(id, {
      machineFlow,
      // Rodando: ETA recalcula na hora do restante; parado: recalcula no PLAY
      estimatedFinishAt: balloon.isRunning
        ? recalcEtaNow(balloon, balloon.machineIds, machineFlow, now)
        : null,
    });
  };

  const handleCipHoursChange = (id, hours) => {
    const v = Math.max(1, Math.min(720, Number(hours) || DEFAULT_CIP_HOURS));
    updateBalloon(id, { cipHours: v });
  };

  const handleCipWashMinutesChange = (id, minutes) => {
    const v = Math.max(1, Math.min(720, Number(minutes) || DEFAULT_CIP_WASH_MINUTES));
    updateBalloon(id, { cipWashMinutes: v });
  };

  const fmtWashDuration = (totalMin) => {
    const t = Math.max(1, Math.round(totalMin));
    if (t < 60) return `${t} min`;
    const h = Math.floor(t / 60);
    const m = t % 60;
    return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}`;
  };

  const handleStartCipWash = (id) => {
    const balloon = balloons.find(b => b.id === id);
    if (!balloon || balloon.isRunning || balloon.cipWashing) return;
    if (balloon.currentVolume > 0) {
      showNotification('Esvazie o balão para iniciar a lavagem CIP', 'warning');
      return;
    }
    const minutes = balloon.cipWashMinutes || DEFAULT_CIP_WASH_MINUTES;
    updateBalloon(id, {
      cipWashing: true,
      cipWashEndsAt: Date.now() + minutes * 60000,
    });
    showNotification(`🛁 Lavagem CIP iniciada no ${balloon.name} (${fmtWashDuration(minutes)})`, 'info');
  };

  const handleCancelCipWash = (id) => {
    const balloon = balloons.find(b => b.id === id);
    updateBalloon(id, { cipWashing: false, cipWashEndsAt: null });
    showNotification(`Lavagem CIP interrompida no ${balloon?.name || 'Balão'}`, 'info');
  };

  // ---------- FORMULAÇÃO DO PRODUTO ----------
  // Cor de referência: produto configurado no Balão 03 (sem nova tabela).
  const formRefProduct = () => {
    const b3 = balloons.find(b => b.id === 3);
    return PRODUCTS.find(p => p.id === b3?.productId && !p.isEmpty) || null;
  };

  // Produto efetivo da formulação: o escolhido no balão, ou o do Balão 03.
  const formProductOf = (balloon) => {
    const chosen = PRODUCTS.find(p => p.id === balloon?.formProductId && !p.isEmpty);
    return chosen || formRefProduct();
  };

  const handleFormProduct = (id, productId) => {
    const balloon = balloons.find(b => b.id === id);
    if (!balloon || balloon.formRunning) return;
    if (!PRODUCTS.some(p => p.id === productId && !p.isEmpty)) return;
    // Trocar o produto reinicia a contagem (como a receita)
    updateBalloon(id, {
      formProductId: productId,
      formAccumMs: 0,
      formStartAt: null,
      formDone: false,
    });
  };

  const handleFormTarget = (id, liters) => {
    const balloon = balloons.find(b => b.id === id);
    if (!balloon || balloon.formRunning) return;
    const v = Number(liters);
    if (!Number.isFinite(v)) return;
    updateBalloon(id, {
      formTargetLiters: Math.max(0, Math.min(balloon.capacity, v)),
      formAccumMs: 0,
      formStartAt: null,
      formDone: false,
    });
  };

  const handleFormRecipe = (id, recipe) => {
    const balloon = balloons.find(b => b.id === id);
    if (!balloon || balloon.formRunning) return;
    // Trocar receita reinicia a contagem do zero com o novo tempo
    updateBalloon(id, {
      formRecipe: recipe,
      formRunning: false,
      formStartAt: null,
      formAccumMs: 0,
      formDone: false,
    });
  };

  const handleFormStart = (id) => {
    const balloon = balloons.find(b => b.id === id);
    if (!balloon || balloon.isRunning || balloon.cipWashing) return;
    if (hasFormSession({ recipe: balloon.formRecipe, running: balloon.formRunning, startAt: balloon.formStartAt, accumMs: balloon.formAccumMs, done: balloon.formDone })) {
      showNotification('Formulação já iniciada — use PAUSAR/RETOMAR', 'warning');
      return;
    }
    if (!balloon.formRecipe) {
      showNotification('Selecione o tipo de receita (normal ou grande)', 'warning');
      return;
    }
    if (!(balloon.formTargetLiters > 0)) {
      showNotification('Informe a quantidade da receita em litros', 'warning');
      return;
    }
    if (balloon.currentVolume > 0) {
      showNotification('Esvazie o balão para iniciar a formulação', 'warning');
      return;
    }
    if (!formProductOf(balloon)) {
      showNotification('Escolha o produto a formular (ou defina um no Balão 03)', 'warning');
      return;
    }
    updateBalloon(id, {
      formRunning: true,
      formStartAt: Date.now(),
      formAccumMs: 0,
      formDone: false,
    });
    showNotification(`🧪 Formulação iniciada no ${balloon.name}`, 'success');
  };

  const handleFormToggle = (id) => {
    const balloon = balloons.find(b => b.id === id);
    if (!balloon || balloon.formDone) return;
    const now = Date.now();
    if (balloon.formRunning) {
      // Pausa: congela cronômetro, animação e nível
      updateBalloon(id, {
        formRunning: false,
        formAccumMs: (balloon.formAccumMs || 0) + (balloon.formStartAt ? now - balloon.formStartAt : 0),
        formStartAt: null,
      });
      showNotification(`Formulação pausada no ${balloon.name}`, 'info');
    } else {
      // Retoma exatamente de onde parou
      updateBalloon(id, { formRunning: true, formStartAt: now });
      showNotification(`Formulação retomada no ${balloon.name}`, 'success');
    }
  };

  const handleFormRestart = (id) => {
    const balloon = balloons.find(b => b.id === id);
    if (!balloon) return;
    updateBalloon(id, {
      formAccumMs: 0,
      formStartAt: balloon.formRunning ? Date.now() : null,
      formDone: false,
    });
    showNotification(`Formulação reiniciada no ${balloon.name}`, 'info');
  };

  const handleFormClear = (id) => {
    const balloon = balloons.find(b => b.id === id);
    updateBalloon(id, {
      formRecipe: null,
      formRunning: false,
      formStartAt: null,
      formAccumMs: 0,
      formDone: false,
    });
    showNotification(`Formulação limpa no ${balloon?.name || 'Balão'} — envase liberado`, 'info');
  };

  const handleGlobalPlay = () => {
    let started = false;
    const now = Date.now();
    setBalloons(prev => prev.map(b => {
      if (b.currentVolume > 0 && b.productId !== 'vazio' && machineCountOf(b) > 0 && !b.isRunning && !b.cipWashing && !hasFormSession({ recipe: b.formRecipe, running: b.formRunning, startAt: b.formStartAt, accumMs: b.formAccumMs, done: b.formDone }) && isCipValid(b.cipDoneAt, b.cipHours, now) && flowRatePerHourForIds(b.machineIds, b.machineFlow) > 0) {
        started = true;
        const freshSession = !b.sessionStart && !(b.sessionAccum > 0);
        return {
          ...b,
          isRunning: true,
          sessionStart: now,
          ...(freshSession ? { initialVolume: b.currentVolume, sessionAccum: 0, expectedAccum: 0 } : {}),
          estimatedFinishAt: calculateFixedEtaForIds(b.currentVolume, b.machineIds, now, b.machineFlow),
          totalPausedMs: (b.totalPausedMs || 0) + (b.pausedAt ? now - b.pausedAt : 0),
          pausedAt: null,
        };
      }
      return b;
    }));
    if (started) {
      setIsRunning(true);
      showNotification('Simulação iniciada em todos os balões disponíveis', 'success');
    } else {
      showNotification('Nenhum balão pode ser iniciado (verifique volume, produto, máquinas e CIP)', 'warning');
    }
  };

  const handleGlobalPause = () => {
    const now = Date.now();
    setBalloons(prev => prev.map(b => ({
      ...b,
      isRunning: false,
      sessionAccum: (b.sessionAccum || 0) + (b.sessionStart ? now - b.sessionStart : 0),
      sessionStart: null,
      pausedAt: b.isRunning ? now : (b.pausedAt ?? null),
    })));
    setIsRunning(false);
    showNotification('Todos os balões pausados', 'info');
  };

  const handleGlobalReset = () => {
    setBalloons(prev => prev.map(b => ({
      ...b,
      currentVolume: b.initialVolume,
      isRunning: false,
      sessionAccum: 0,
      sessionStart: null,
      expectedAccum: 0,
      estimatedFinishAt: null,
      pausedAt: null,
    })));
    setIsRunning(false);
    showNotification('Todos os balões resetados', 'info');
  };

  // Refs para o loop sempre enxergar as versões mais recentes
  // (som ligado/desligado, notificações) sem reiniciar o relógio.
  const liveRefs = useRef({ playAlertSound, showNotification });
  useEffect(() => {
    liveRefs.current = { playAlertSound, showNotification };
  });

  // Conclusão da lavagem CIP: verifica a cada 1s (sempre ligado, mesmo
  // com o envase parado) e marca o CIP como realizado ao terminar o ciclo.
  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      const prev = balloonsRef.current;
      const done = prev.filter((b) => b.cipWashing && b.cipWashEndsAt && now >= b.cipWashEndsAt);
      if (done.length === 0) return;
      setBalloons((cur) =>
        cur.map((b) =>
          b.cipWashing && b.cipWashEndsAt && now >= b.cipWashEndsAt
            ? { ...b, cipWashing: false, cipWashEndsAt: null, cipDoneAt: now }
            : b
        )
      );
      done.forEach((b) => {
        liveRefs.current.playAlertSound();
        liveRefs.current.showNotification(
          `🛁 CIP concluído no ${b.name} — válido por ${b.cipHours}h`,
          'success'
        );
      });
    }, 1000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Conclusão da FORMULAÇÃO: a cada 1s verifica quem atingiu 100%.
  // Transfere a quantidade da receita p/ o balão (com o produto formulado),
  // limpa a sessão e libera o envase. O já consumido não existe aqui:
  // a formulação só ENCHE a partir do zero.
  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      const prev = balloonsRef.current;
      const b3 = prev.find((x) => x.id === 3);
      const refId = PRODUCTS.find((p) => p.id === b3?.productId && !p.isEmpty)?.id || null;
      const done = prev.filter((b) => {
        if (!b.formRunning || !b.formRecipe || b.formDone) return false;
        const total = recipeDurationMs(b.formRecipe);
        const elapsed = (b.formAccumMs || 0) + (b.formStartAt ? now - b.formStartAt : 0);
        return elapsed >= total;
      });
      if (done.length === 0) return;
      setBalloons((cur) =>
        cur.map((b) => {
          if (!b.formRunning || !b.formRecipe || b.formDone) return b;
          const total = recipeDurationMs(b.formRecipe);
          const elapsed = (b.formAccumMs || 0) + (b.formStartAt ? now - b.formStartAt : 0);
          if (elapsed < total) return b;
          const target = Math.max(0, Math.min(b.capacity, Number(b.formTargetLiters) || 0));
          const prod = PRODUCTS.find((p) => p.id === b.formProductId && !p.isEmpty)
            || PRODUCTS.find((p) => p.id === refId && !p.isEmpty)
            || PRODUCTS[0];
          return {
            ...b,
            currentVolume: target,
            initialVolume: target,
            productId: prod.id,
            sessionAccum: 0,
            sessionStart: null,
            expectedAccum: 0,
            estimatedFinishAt: null,
            pausedAt: null,
            totalPausedMs: 0,
            formRunning: false,
            formStartAt: null,
            formAccumMs: 0,
            formDone: false,
          };
        })
      );
      done.forEach((b) => {
        liveRefs.current.playAlertSound();
        const target = Math.max(0, Math.min(b.capacity, Number(b.formTargetLiters) || 0));
        const prod = PRODUCTS.find((p) => p.id === b.formProductId && !p.isEmpty)
          || PRODUCTS.find((p) => p.id === refId && !p.isEmpty)
          || PRODUCTS[0];
        const label = b.formRecipe === 'grande' ? '02:50:00' : '01:50:00';
        liveRefs.current.showNotification(
          `✅ FORMULAÇÃO CONCLUÍDA no ${b.name} (${label}) — ${target.toLocaleString('pt-BR')} L de ${prod.name} no balão, liberado p/ envase`,
          'success'
        );
      });
    }, 1000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Motor da simulação: tick a cada 1 SEGUNDO (setInterval 1000ms).
  // A cada tick, mede os segundos REAIS decorridos (float completo, sem
  // arredondar) e subtrai calculateConsumption(máquinas, segundos) — ou seja,
  // 0.4444444444 L/s por máquina. Medir o tempo real mantém a média exata
  // mesmo com o pequeno atraso natural do setInterval.
  // PROIBIDO recalcular estimatedFinishAt aqui: o tick SÓ desce o nível.
  // A ETA é travada no PLAY e exibida congelada.
  useEffect(() => {
    if (!isRunning) return;
    let last = Date.now();
    const timer = setInterval(() => {
      const now = Date.now();
      const seconds = (now - last) / 1000; // float completo, NÃO arredondar
      last = now;

      const prev = balloonsRef.current;
      let changed = false;
      const cipExpiredIds = [];
      const noFlowIds = [];
      const next = prev.map((balloon) => {
        if (!balloon.isRunning || balloon.currentVolume <= 0) return balloon;
        // Sem vazão (sem máquinas ou 0% em todas): pausa sozinho, nunca roda zerado
        if (!(flowRatePerHourForIds(balloon.machineIds, balloon.machineFlow) > 0)) {
          changed = true;
          noFlowIds.push(balloon.id);
          return {
            ...balloon,
            isRunning: false,
            pausedAt: now,
            sessionAccum: (balloon.sessionAccum || 0) + (now - (balloon.sessionStart || now)),
            sessionStart: null,
          };
        }
        // CIP venceu no meio do envase: pausa o balão e exige novo CIP
        if (!isCipValid(balloon.cipDoneAt, balloon.cipHours, now)) {
          changed = true;
          cipExpiredIds.push(balloon.id);
          return {
            ...balloon,
            isRunning: false,
            pausedAt: now,
            sessionAccum: (balloon.sessionAccum || 0) + (now - (balloon.sessionStart || now)),
            sessionStart: null,
          };
        }
        const consumption = calculateConsumptionForIds(balloon.machineIds, seconds, balloon.machineFlow);
        if (!(consumption > 0)) return balloon;
        const newVolume = Math.max(0, balloon.currentVolume - consumption);
        if (newVolume === balloon.currentVolume) return balloon;
        changed = true;
        // Auditoria exata: acumula o que foi REALMENTE retirado neste tick
        // (igual ao consumo, exceto no arredondamento final para zero)
        const taken = balloon.currentVolume - newVolume;
        const expectedAccum = (balloon.expectedAccum || 0) + taken;
        if (newVolume <= 0) {
          return {
            ...balloon,
            currentVolume: 0,
            isRunning: false,
            productId: 'vazio',
            sessionAccum: (balloon.sessionAccum || 0) + (now - (balloon.sessionStart || now)),
            sessionStart: null,
            expectedAccum,
            estimatedFinishAt: null,
            pausedAt: null,
          };
        }
        return { ...balloon, currentVolume: newVolume, expectedAccum };
      });

      if (changed) {
        next.forEach((b, i) => {
          if (noFlowIds.includes(b.id)) {
            liveRefs.current.showNotification('Sem vazão ativa — envase pausado', 'warning');
          } else if (cipExpiredIds.includes(b.id)) {
            liveRefs.current.playAlertSound();
            liveRefs.current.showNotification(`🛁 CIP venceu — ${b.name} pausado, realize o CIP para continuar`, 'warning');
          } else if (b.currentVolume <= 0 && prev[i].currentVolume > 0) {
            liveRefs.current.playAlertSound();
            liveRefs.current.showNotification(`${b.name} esvaziou — aguardando abastecimento`, 'warning');
          } else if (
            b.currentVolume > 0 &&
            b.currentVolume <= LOW_LEVEL_THRESHOLD &&
            prev[i].currentVolume > LOW_LEVEL_THRESHOLD
          ) {
            // Cruzou os 300 L descendo: alerta único (só dispara na travessia)
            liveRefs.current.playAlertSound();
            liveRefs.current.showNotification(
              `⚠ ${b.name} em NÍVEL BAIXO — restam ${b.currentVolume.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} L`,
              'warning'
            );
          }
        });
        setBalloons(next);
      }

      if (!next.some((b) => b.isRunning)) {
        setIsRunning(false);
      }
    }, 1000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRunning]);

  const totalVolume = balloons.reduce((sum, b) => sum + b.currentVolume, 0);
  const totalCapacity = balloons.reduce((sum, b) => sum + b.capacity, 0);
  const totalFlowRate = balloons
    .filter(b => b.isRunning)
    .reduce((sum, b) => sum + flowRatePerHourForIds(b.machineIds, b.machineFlow), 0);
  const emptyCount = balloons.filter(b => b.currentVolume === 0 || b.productId === 'vazio').length;
  // Id do produto de referência (Balão 03) p/ sugerir na formulação
  const refProductId = formRefProduct()?.id || null;
  const runningCount = balloons.filter(b => b.isRunning).length;

  // Página pública: SÓ leitura, sem nenhum controle operacional
  if (publicToken) {
    return <PublicView token={publicToken} />;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white overflow-x-clip">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-blue-500/5 via-transparent to-purple-500/5" />
        <div className="absolute top-0 left-0 w-full h-full bg-[url('data:image/svg+xml,%3Csvg viewBox=%220 0 400 400%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noise%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.9%22 numOctaves=%224%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noise)%22 opacity=%220.03%22/%3E%3C/svg%3E')]" />
      </div>

      <header className="relative z-10 border-b border-slate-800/50 bg-slate-950/80 backdrop-blur-xl sticky top-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg shadow-blue-500/25">
                <Volume2 className="w-7 h-7 text-white" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Simulador de Balões - Triângulo</h1>
                <p className="text-xs sm:text-sm text-slate-400">Supervisório Industrial de Envasamento</p>
              </div>
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              <span
                className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-slate-800/50 border border-slate-700/50 text-[11px] font-medium text-slate-400"
                title={isSupabaseEnabled ? 'Sincronizando com a nuvem (Supabase)' : 'Somente neste navegador (conecte o Supabase p/ nuvem)'}
              >
                <span className={`w-2 h-2 rounded-full ${isSupabaseEnabled ? 'bg-green-400' : 'bg-slate-500'}`} />
                {isSupabaseEnabled ? 'Nuvem' : 'Local'}
              </span>
              <button
                onClick={() => setShareOpen(true)}
                className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs sm:text-sm font-semibold transition-all shadow-lg shadow-cyan-600/30"
                title="Gerar link de acompanhamento (somente leitura)"
              >
                <Share2 className="w-4 h-4 sm:w-5 sm:h-5" />
                <span className="hidden sm:inline">Compartilhar</span>
              </button>
              <button
                onClick={() => setSoundEnabled(!soundEnabled)}
                className="p-2 rounded-xl bg-slate-800/50 hover:bg-slate-700/50 border border-slate-700/50 transition-all text-slate-300 hover:text-white"
                title={soundEnabled ? 'Desativar alertas sonoros' : 'Ativar alertas sonoros'}
              >
                {soundEnabled ? <Speaker className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
              </button>
              <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-800/50 border border-slate-700/50">
                <span className={`w-2 h-2 rounded-full ${isRunning ? 'bg-green-400 animate-pulse' : 'bg-slate-500'}`} />
                <span className="text-sm font-medium text-slate-300">
                  {isRunning ? 'SIMULAÇÃO ATIVA' : 'SIMULAÇÃO PARADA'}
                </span>
              </div>
              <div className="flex sm:hidden items-center gap-2 px-3 py-1.5 rounded-full bg-slate-800/50 border border-slate-700/50">
                <span className={`w-2 h-2 rounded-full ${isRunning ? 'bg-green-400 animate-pulse' : 'bg-slate-500'}`} />
                <span className="text-xs font-medium text-slate-300">
                  {isRunning ? 'ATIVA' : 'PARADA'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="relative z-10 max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6">
        <Dashboard
          balloons={balloons}
          totalVolume={totalVolume}
          totalCapacity={totalCapacity}
          totalFlowRate={totalFlowRate}
          emptyCount={emptyCount}
          runningCount={runningCount}
        />

        <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
          {balloons.map((balloon) => (
            <motion.div
              key={balloon.id}
              className="flex flex-col gap-4 sm:gap-6 min-w-0"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: balloon.id * 0.1 }}
            >
              <Balloon
                id={balloon.id}
                name={balloon.name}
                capacity={balloon.capacity}
                currentVolume={balloon.currentVolume}
                productId={balloon.productId}
                isRunning={balloon.isRunning}
                isEmpty={balloon.currentVolume === 0 || balloon.productId === 'vazio'}
                machines={machineCountOf(balloon)}
                machineIds={balloon.machineIds}
                machineFlow={balloon.machineFlow}
                estimatedFinishAt={balloon.estimatedFinishAt}
                cipHours={balloon.cipHours}
                cipDoneAt={balloon.cipDoneAt}
                cipWashing={balloon.cipWashing}
                cipWashEndsAt={balloon.cipWashEndsAt}
                formulation={{ recipe: balloon.formRecipe, running: balloon.formRunning, startAt: balloon.formStartAt, accumMs: balloon.formAccumMs, done: balloon.formDone }}
                refColor={formProductOf(balloon)?.color || '#94a3b8'}
                refProductName={formProductOf(balloon)?.name || '—'}
                formTargetLiters={balloon.formTargetLiters}
              />
              <ControlPanel
                id={balloon.id}
                name={balloon.name}
                capacity={balloon.capacity}
                currentVolume={balloon.currentVolume}
                setCurrentVolume={(v) => handleVolumeChange(balloon.id, v)}
                productId={balloon.productId}
                setProductId={(p) => handleProductChange(balloon.id, p)}
                machines={machineCountOf(balloon)}
                machineIds={balloon.machineIds}
                onToggleMachine={(mid) => handleMachineToggle(balloon.id, mid)}
                machineFlow={balloon.machineFlow}
                onMachinePercent={(mid, p) => handleMachinePercentChange(balloon.id, mid, p)}
                expectedAccum={balloon.expectedAccum}
                isRunning={balloon.isRunning}
                isEmpty={balloon.currentVolume === 0 || balloon.productId === 'vazio'}
                onPlay={() => handlePlay(balloon.id)}
                onPause={() => handlePause(balloon.id)}
                onReset={() => handleReset(balloon.id)}
                onEmpty={() => handleEmpty(balloon.id)}
                initialVolume={balloon.initialVolume}
                sessionElapsedMs={(balloon.sessionAccum || 0) + (balloon.isRunning && balloon.sessionStart ? Date.now() - balloon.sessionStart : 0)}
                cipHours={balloon.cipHours}
                setCipHours={(h) => handleCipHoursChange(balloon.id, h)}
                cipDoneAt={balloon.cipDoneAt}
                cipWashMinutes={balloon.cipWashMinutes}
                setCipWashMinutes={(m) => handleCipWashMinutesChange(balloon.id, m)}
                cipWashing={balloon.cipWashing}
                cipWashEndsAt={balloon.cipWashEndsAt}
                onStartCipWash={() => handleStartCipWash(balloon.id)}
                onCancelCipWash={() => handleCancelCipWash(balloon.id)}
                formRecipe={balloon.formRecipe}
                formRunning={balloon.formRunning}
                formStartAt={balloon.formStartAt}
                formAccumMs={balloon.formAccumMs}
                formDone={balloon.formDone}
                refProductId={refProductId}
                formProductId={balloon.formProductId}
                onFormProduct={(p) => handleFormProduct(balloon.id, p)}
                formTargetLiters={balloon.formTargetLiters}
                onFormTarget={(v) => handleFormTarget(balloon.id, v)}
                onFormRecipe={(r) => handleFormRecipe(balloon.id, r)}
                onFormStart={() => handleFormStart(balloon.id)}
                onFormToggle={() => handleFormToggle(balloon.id)}
                onFormRestart={() => handleFormRestart(balloon.id)}
                onFormClear={() => handleFormClear(balloon.id)}
              />
            </motion.div>
          ))}
        </div>

        <div className="mt-8 glass-panel p-6">
          <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <Settings className="w-5 h-5 text-blue-400" />
            Controles Globais
          </h3>
          <div className="flex flex-wrap gap-2 sm:gap-3">
            <button
              onClick={handleGlobalPlay}
              disabled={isRunning || !balloons.some(b => b.currentVolume > 0 && b.productId !== 'vazio' && machineCountOf(b) > 0 && !b.isRunning && !b.cipWashing && !hasFormSession({ recipe: b.formRecipe, running: b.formRunning, startAt: b.formStartAt, accumMs: b.formAccumMs, done: b.formDone }) && isCipValid(b.cipDoneAt, b.cipHours) && flowRatePerHourForIds(b.machineIds, b.machineFlow) > 0)}
              className="btn-primary flex items-center justify-center gap-2 px-6 py-3 max-sm:flex-1 max-sm:px-3 max-sm:text-sm"
            >
              <span className="w-5 h-5" />
              INICIAR TODOS
            </button>
            <button
              onClick={handleGlobalPause}
              disabled={!isRunning}
              className="btn-secondary flex items-center justify-center gap-2 px-6 py-3 max-sm:flex-1 max-sm:px-3 max-sm:text-sm"
            >
              <span className="w-5 h-5" />
              PAUSAR TODOS
            </button>
            <button
              onClick={handleGlobalReset}
              disabled={isRunning}
              className="btn-secondary flex items-center justify-center gap-2 px-6 py-3 max-sm:flex-1 max-sm:px-3 max-sm:text-sm"
            >
              <RefreshCw className="w-5 h-5 shrink-0" />
              RESETAR TODOS
            </button>
          </div>
          {savedAt && (
            <p className="text-xs text-slate-500 mt-4 tabular-nums">
              💾 Estado salvo localmente às {new Date(savedAt).toLocaleTimeString('pt-BR')} — níveis exatos preservados
            </p>
          )}
        </div>
      </main>

      <ShareModal
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        onToast={showNotification}
      />

      <AnimatePresence>
        {showToast.visible && (
          <motion.div
            key="toast"
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -50, scale: 0.9 }}
            className={`fixed bottom-4 left-4 right-4 sm:left-auto sm:bottom-6 sm:right-6 z-50 px-4 sm:px-6 py-4 rounded-xl glass-panel border-l-4 flex items-center gap-3 sm:min-w-[300px] sm:max-w-md shadow-2xl
              ${showToast.type === 'success' ? 'border-green-500' : ''}
              ${showToast.type === 'warning' ? 'border-yellow-500' : ''}
              ${showToast.type === 'error' ? 'border-red-500' : ''}
              ${showToast.type === 'info' ? 'border-blue-500' : ''}
            `}
          >
            <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0
              ${showToast.type === 'success' ? 'bg-green-500/20 text-green-400' : ''}
              ${showToast.type === 'warning' ? 'bg-yellow-500/20 text-yellow-400' : ''}
              ${showToast.type === 'error' ? 'bg-red-500/20 text-red-400' : ''}
              ${showToast.type === 'info' ? 'bg-blue-500/20 text-blue-400' : ''}
            `}>
              {showToast.type === 'success' && <Info className="w-5 h-5" />}
              {showToast.type === 'warning' && <AlertTriangle className="w-5 h-5" />}
              {showToast.type === 'error' && <AlertTriangle className="w-5 h-5" />}
              {showToast.type === 'info' && <Info className="w-5 h-5" />}
            </div>
            <p className="text-sm font-medium text-white">{showToast.message}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default App;