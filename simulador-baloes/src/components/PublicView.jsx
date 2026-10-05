'use client';

import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Factory, Eye, AlertTriangle } from 'lucide-react';
import Balloon from './Balloon';
import { validateShareToken, ownerOfToken, fetchOwnerBalloons } from '../share';
import { STORAGE_KEY, BALLOON_CONFIG, PRODUCTS } from '../constants';
import { supabase, isSupabaseEnabled } from '../supabaseClient';
import { rowToBalloon } from '../sync';

/** Lê o snapshot local dos balões (somente leitura, sem alterar nada). */
function readSnapshot() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    const arr = Array.isArray(data) ? data : data?.balloons;
    return Array.isArray(arr) && arr.length > 0 ? arr : null;
  } catch {
    return null;
  }
}

/** Converte linhas do banco para o formato do Balloon (leitura ao vivo). */
function liveBalloon(row, cfg) {
  // Na leitura, o estado RODANDO vem do banco em tempo real
  // (rowToBalloon zera p/ o painel não retomar sozinho no reload).
  return { ...rowToBalloon(row, cfg), isRunning: row.is_running === true };
}

/** Converte linhas do banco para o formato do Balloon. */
function rowsToBalloons(rows) {
  return BALLOON_CONFIG.map((cfg) => {
    const row = rows.find((r) => r.balloon_id === cfg.id);
    return row ? liveBalloon(row, cfg) : null;
  }).filter(Boolean);
}

const fmtClock = (d) =>
  d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

const PublicView = ({ token }) => {
  const [link, setLink] = useState(null);
  const [checking, setChecking] = useState(true);
  const [balloons, setBalloons] = useState(null);
  const [updatedAt, setUpdatedAt] = useState(() => new Date());
  const [live, setLive] = useState(false);
  const ownerRef = useRef(null);

  // Cor da formulação = produto escolhido no balão, ou o do Balão 03
  const refB3 = (balloons || []).find((b) => b.id === 3);
  const refProdPub = PRODUCTS.find((p) => p.id === refB3?.productId && !p.isEmpty);
  const formProdOfPub = (b) => PRODUCTS.find((p) => p.id === b?.formProductId && !p.isEmpty) || refProdPub || null;
  const pubColorOf = (b) => formProdOfPub(b)?.color || '#94a3b8';
  const pubNameOf = (b) => formProdOfPub(b)?.name || '—';

  useEffect(() => {
    document.title = 'Acompanhar Balões — Somente leitura';
    let cancelled = false;

    const load = async () => {
      // 1) Valida o token (nuvem ou local)
      const valid = await validateShareToken(token);
      if (cancelled) return;
      setLink(valid);
      if (!valid) {
        setChecking(false);
        return;
      }
      // 2) Busca os balões: nuvem (dono do link) ou snapshot local
      let list = null;
      if (isSupabaseEnabled) {
        if (!ownerRef.current) {
          ownerRef.current = await ownerOfToken(token);
        }
        const ownerId = ownerRef.current;
        if (!cancelled && ownerId && ownerId !== 'local') {
          const rows = await fetchOwnerBalloons(ownerId);
          if (rows) list = rowsToBalloons(rows);
        }
      }
      if (!list) list = readSnapshot();
      if (cancelled) return;
      setBalloons(list);
      setUpdatedAt(new Date());
      setChecking(false);
    };

    load();
    // Polling de segurança a cada 1s (SÓ leitura; pausa com aba oculta).
    // O Realtime cobre o ao vivo; o polling é rede de segurança.
    const timer = setInterval(() => {
      if (document.hidden) return;
      load();
    }, 1000);
    const onStorage = (e) => {
      if (!e.key || e.key === STORAGE_KEY) load();
    };
    window.addEventListener('storage', onStorage);
    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener('storage', onStorage);
    };
  }, [token]);

  // Tempo real via Supabase Realtime: aplica a linha alterada na hora,
  // sem esperar o polling. (Exige o SQL do realtime aplicado.)
  useEffect(() => {
    if (!isSupabaseEnabled || !link) return;
    const ownerId = ownerRef.current;
    if (!ownerId || ownerId === 'local') return;
    const channel = supabase
      .channel(`tanks-${ownerId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tanks', filter: `owner_id=eq.${ownerId}` },
        (payload) => {
          const row = payload.new;
          if (!row) return;
          const cfg = BALLOON_CONFIG.find((c) => c.id === row.balloon_id);
          if (!cfg) return;
          const updated = liveBalloon(row, cfg);
          setBalloons((prev) => {
            if (!prev) return prev;
            return prev.map((b) => (b.id === cfg.id ? updated : b));
          });
          setUpdatedAt(new Date());
          setLive(true);
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
      setLive(false);
    };
  }, [link]);

  if (checking && !link) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-4">
        <p className="text-slate-400 animate-pulse">Validando link...</p>
      </div>
    );
  }

  // Token inválido / revogado / expirado — ou aberto em outro
  // navegador/aparelho sem acesso aos dados (sem Supabase conectado)
  if (!link) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-4">
        <div className="max-w-md w-full glass-panel p-6 sm:p-8 text-center !border-red-500/40">
          <AlertTriangle className="w-14 h-14 text-red-400 mx-auto mb-3" />
          <h1 className="text-xl font-bold text-white">Link não reconhecido aqui</h1>
          <p className="text-sm text-slate-300 mt-3">
            Este link <b>não existe neste navegador</b>, expirou ou foi revogado.
          </p>
          <ul className="text-xs text-slate-400 mt-3 text-left list-disc list-inside space-y-1 bg-slate-800/50 rounded-xl p-3">
            <li>Abrindo em <b>outro celular ou aba anônima</b>? O link local só vale no navegador onde foi criado.</li>
            <li>Para acompanhar de outro aparelho, conecte o Supabase (ver <span className="font-mono">supabase/SUPABASE_SETUP.md</span>).</li>
            <li>Se foi revogado, peça um novo link a quem compartilhou.</li>
          </ul>
          <a
            href="#/"
            className="inline-block mt-4 px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 text-white text-sm font-semibold"
          >
            Voltar ao painel deste aparelho
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Topo com logo da empresa */}
      <header className="bg-slate-950/80 backdrop-blur-xl border-b border-slate-800/50 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center shadow-lg shadow-blue-500/25">
              <Factory className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-bold text-white leading-tight">
                Triângulo — Balões
              </h1>
              <p className="text-xs text-slate-400">Acompanhamento em tempo real</p>
            </div>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500/15 border border-amber-500/40 text-amber-300 text-xs font-bold">
              <Eye className="w-4 h-4" />
              VISUALIZAÇÃO — Somente leitura
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-800/50 border border-slate-700/50 text-slate-300 text-xs font-mono tabular-nums">
              <span className={`w-2 h-2 rounded-full ${live ? 'bg-green-400' : 'bg-amber-400'} animate-pulse`} />
              {live ? 'AO VIVO' : 'Atualizado'}: {fmtClock(updatedAt)}
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-3 sm:px-6 py-4 sm:py-6">
        {!balloons ? (
          <div className="glass-panel p-8 text-center">
            <p className="text-lg font-bold text-white">Nenhum dado encontrado neste navegador</p>
            <p className="text-sm text-slate-400 mt-2">
              Abra o painel principal neste mesmo navegador para gerar os dados dos balões.
            </p>
            <a
              href="#/"
              className="inline-block mt-4 px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 text-white text-sm font-semibold"
            >
              Abrir painel
            </a>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
            {balloons.map((b, i) => (
              <motion.div
                key={b.id ?? i}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                className="min-w-0"
              >
                <Balloon
                  id={b.id}
                  name={b.name}
                  capacity={b.capacity}
                  currentVolume={b.currentVolume}
                  productId={b.productId}
                  isRunning={b.isRunning}
                  isEmpty={b.currentVolume === 0 || b.productId === 'vazio'}
                  machines={Array.isArray(b.machineIds) ? b.machineIds.length : (b.machines ?? 0)}
                  machineIds={b.machineIds}
                  machineFlow={b.machineFlow}
                  estimatedFinishAt={b.estimatedFinishAt ?? null}
                  cipHours={b.cipHours}
                  cipDoneAt={b.cipDoneAt ?? null}
                  cipWashing={b.cipWashing}
                  cipWashEndsAt={b.cipWashEndsAt ?? null}
                  formulation={b.formRecipe ? { recipe: b.formRecipe, running: !!b.formRunning, startAt: b.formStartAt ?? null, accumMs: b.formAccumMs || 0, done: !!b.formDone } : null}
                  refColor={pubColorOf(b)}
                  refProductName={pubNameOf(b)}
                />
              </motion.div>
            ))}
          </div>
        )}
        <p className="text-center text-xs text-slate-500 mt-6">
          Dados atualizados em tempo real · Sem permissão para operar
        </p>
      </main>
    </div>
  );
};

export default PublicView;