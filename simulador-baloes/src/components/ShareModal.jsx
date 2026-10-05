'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Share2, Copy, MessageCircle, Ban, Check, X, Link2, Plus, Eye } from 'lucide-react';
import {
  loadShareLinks,
  createShareLink,
  setShareLinkActive,
  deleteShareLink,
  buildShareUrl,
} from '../share';
import { isSupabaseEnabled } from '../supabaseClient';

const fmtDateTime = (ts) =>
  new Date(ts).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

const ShareModal = ({ open, onClose, onToast }) => {
  const [links, setLinks] = useState([]);
  const [copied, setCopied] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setLinks(await loadShareLinks());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) refresh();
  }, [open, refresh]);

  const handleCreate = async () => {
    setBusy(true);
    try {
      const link = await createShareLink();
      await refresh();
      onToast?.(`Link criado: ${buildShareUrl(link.token)}`, 'success');
    } catch {
      onToast?.('Falha ao gerar o link. Tente de novo.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const copyLink = async (token) => {
    const url = buildShareUrl(token);
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(token);
    setTimeout(() => setCopied((c) => (c === token ? null : c)), 2000);
  };

  const sendWhatsApp = (token) => {
    const url = buildShareUrl(token);
    window.open(
      `https://wa.me/?text=${encodeURIComponent(`🏭 Acompanhe os balões em tempo real (somente leitura): ${url}`)}`,
      '_blank'
    );
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="share-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={onClose}
        >
          <motion.div
            key="share-modal"
            initial={{ opacity: 0, y: 40, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 40, scale: 0.98 }}
            onClick={(e) => e.stopPropagation()}
            className="glass-panel w-full sm:max-w-2xl max-h-[92vh] overflow-y-auto p-4 sm:p-6 rounded-b-none sm:rounded-2xl"
          >
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Share2 className="w-5 h-5 text-cyan-400" />
                Compartilhar acompanhamento
              </h3>
              <button
                onClick={onClose}
                className="p-2 rounded-xl bg-slate-800/50 hover:bg-slate-700/50 text-slate-300"
                aria-label="Fechar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-slate-400 mb-3">
              Quem abrir o link vê os 3 balões em tempo real, <b>sem</b> poder dar play,
              pausar ou editar. Somente leitura.
              {isSupabaseEnabled
                ? ' ☁️ Nuvem ativa: o link abre em qualquer aparelho.'
                : ' Links locais: valem neste navegador.'}
            </p>
            {typeof window !== 'undefined' && !isSupabaseEnabled && /localhost|127\.0\.0\.1/.test(window.location.hostname) && (
              <p className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/25 rounded-xl p-3 mb-3">
                ⚠ O endereço é <b>localhost</b>: o link só abre <b>neste computador</b>.
                Para outro celular na mesma rede, abra o painel pelo IP (ex.: <span className="font-mono">http://192.168.x.x:5173</span> com <span className="font-mono">npm run dev -- --host</span>) e gere o link por lá.
                Para internet de verdade, conecte o Supabase (ver <span className="font-mono">supabase/SUPABASE_SETUP.md</span>).
              </p>
            )}

            <button
              onClick={handleCreate}
              disabled={busy}
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              <Plus className="w-4 h-4" />
              {busy ? 'Gerando...' : 'Gerar link de acompanhamento'}
            </button>

            <div className="mt-4 space-y-3">
              {loading && (
                <p className="text-sm text-slate-500 text-center py-4">
                  Carregando links...
                </p>
              )}
              {!loading && links.length === 0 && (
                <p className="text-sm text-slate-500 text-center py-4">
                  Nenhum link gerado ainda.
                </p>
              )}
              {links.map((l) => {
                const url = buildShareUrl(l.token);
                return (
                  <div
                    key={l.token}
                    className={`p-3 rounded-xl border ${l.isActive ? 'bg-slate-800/50 border-slate-700/50' : 'bg-slate-800/30 border-slate-700/30 opacity-60'}`}
                  >
                    <div className="flex items-center gap-2 text-sm">
                      <Link2 className="w-4 h-4 text-cyan-400 shrink-0" />
                      <span className="font-mono text-cyan-200 truncate">{url}</span>
                      <span className={`ml-auto shrink-0 px-2 py-0.5 rounded-full text-[11px] font-bold ${l.isActive ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'}`}>
                        {l.isActive ? 'ATIVO' : 'REVOGADO'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Criado em {fmtDateTime(l.createdAt)}
                    </p>
                    <div className="flex flex-wrap gap-2 mt-2">
                      <button
                        onClick={() => window.open(url, '_blank')}
                        disabled={!l.isActive}
                        className="btn-secondary !px-3 !py-1.5 !text-xs flex items-center gap-1.5 disabled:opacity-40"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        Testar link
                      </button>
                      <button
                        onClick={() => copyLink(l.token)}
                        disabled={!l.isActive}
                        className="btn-secondary !px-3 !py-1.5 !text-xs flex items-center gap-1.5 disabled:opacity-40"
                      >
                        {copied === l.token ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        {copied === l.token ? 'Copiado!' : 'Copiar'}
                      </button>
                      <button
                        onClick={() => sendWhatsApp(l.token)}
                        disabled={!l.isActive}
                        className="btn-secondary !px-3 !py-1.5 !text-xs flex items-center gap-1.5 disabled:opacity-40"
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                        WhatsApp
                      </button>
                      {l.isActive ? (
                        <button
                          onClick={async () => setLinks(await setShareLinkActive(l.token, false))}
                          className="btn-danger !px-3 !py-1.5 !text-xs flex items-center gap-1.5"
                        >
                          <Ban className="w-3.5 h-3.5" />
                          Revogar
                        </button>
                      ) : (
                        <button
                          onClick={async () => setLinks(await deleteShareLink(l.token))}
                          className="btn-secondary !px-3 !py-1.5 !text-xs flex items-center gap-1.5"
                        >
                          <X className="w-3.5 h-3.5" />
                          Excluir
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default ShareModal;