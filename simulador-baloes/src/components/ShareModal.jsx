'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Share2, Copy, MessageCircle, Check, X } from 'lucide-react';
import { buildShareUrl, SHARE_SLUG } from '../share';
import { isSupabaseEnabled } from '../supabaseClient';

const ShareModal = ({ open, onClose }) => {
  const [copied, setCopied] = useState(false);
  const url = typeof window !== 'undefined' ? buildShareUrl() : '';

  const copyLink = async () => {
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
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const sendWhatsApp = () => {
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
            className="glass-panel w-full sm:max-w-lg max-h-[92vh] overflow-y-auto p-4 sm:p-6 rounded-b-none sm:rounded-2xl"
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
            <p className="text-sm text-slate-400 mb-4">
              <b>Um link único para todo mundo.</b> Quem abrir vê os 3 balões em
              tempo real, <b>sem</b> poder dar play, pausar ou editar. Sempre ligado.
            </p>

            <div className="p-3 rounded-xl bg-slate-800/50 border border-slate-700/50">
              <p className="text-[11px] text-slate-500 mb-1">Link único (#{SHARE_SLUG})</p>
              <p className="font-mono text-sm text-cyan-200 break-all">{url}</p>
              <div className="flex flex-wrap gap-2 mt-3">
                <button
                  onClick={copyLink}
                  className="btn-secondary !px-4 !py-2 !text-sm flex items-center gap-2"
                >
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  {copied ? 'Copiado!' : 'Copiar'}
                </button>
                <button
                  onClick={sendWhatsApp}
                  className="btn-secondary !px-4 !py-2 !text-sm flex items-center gap-2"
                >
                  <MessageCircle className="w-4 h-4" />
                  WhatsApp
                </button>
                <button
                  onClick={() => window.open(url, '_blank')}
                  className="btn-secondary !px-4 !py-2 !text-sm flex items-center gap-2"
                >
                  Testar link
                </button>
              </div>
            </div>

            {!isSupabaseEnabled && (
              <p className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/25 rounded-xl p-3 mt-3">
                ⚠ Sem nuvem: o link só mostra dados <b>deste navegador</b>. Conecte o
                Supabase para valer em qualquer aparelho (ver <span className="font-mono">supabase/SUPABASE_SETUP.md</span>).
              </p>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default ShareModal;