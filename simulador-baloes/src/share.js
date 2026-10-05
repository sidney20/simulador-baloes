// ============================================================
// Links de compartilhamento SOMENTE LEITURA (#/acompanhar/:token)
// Com Supabase configurado: links e dados vivem na nuvem (multi-aparelho).
// Sem Supabase: tudo no LocalStorage deste navegador.
// ============================================================

import { supabase, isSupabaseEnabled, getOwnerId } from './supabaseClient';

export const SHARE_LINKS_KEY = 'simulador-baloes-share-links';

const TOKEN_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/** Token aleatório de 10 chars (ex: a8Xk2p9Qz). */
export function generateShareToken(length = 10) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let token = '';
  for (let i = 0; i < length; i++) {
    token += TOKEN_ALPHABET[bytes[i] % TOKEN_ALPHABET.length];
  }
  return token;
}

/** URL pública do link (hash route: funciona em qualquer hospedagem estática). */
export function buildShareUrl(token) {
  return `${window.location.origin}${window.location.pathname}#/acompanhar/${token}`;
}

// ---------- Local (fallback) ----------

function loadLocalLinks() {
  try {
    const raw = localStorage.getItem(SHARE_LINKS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistLocalLinks(links) {
  localStorage.setItem(SHARE_LINKS_KEY, JSON.stringify(links));
}

const toLink = (r) => ({
  token: r.token,
  createdAt: Date.parse(r.created_at) || Date.now(),
  expiresAt: r.expires_at ? Date.parse(r.expires_at) : null,
  isActive: r.is_active !== false,
});

// ---------- API unificada (sempre async) ----------

export async function loadShareLinks() {
  if (!isSupabaseEnabled) return loadLocalLinks();
  try {
    const { data, error } = await supabase
      .from('tank_share_links')
      .select('*')
      .eq('created_by', getOwnerId())
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(toLink);
  } catch {
    return loadLocalLinks();
  }
}

/** Cria e salva um novo link ativo. */
export async function createShareLink() {
  if (!isSupabaseEnabled) {
    const links = loadLocalLinks();
    let token = generateShareToken();
    while (links.some((l) => l.token === token)) token = generateShareToken();
    const link = { token, createdAt: Date.now(), expiresAt: null, isActive: true };
    links.unshift(link);
    persistLocalLinks(links);
    return link;
  }
  for (let attempt = 0; attempt < 5; attempt++) {
    const token = generateShareToken();
    const { error } = await supabase.from('tank_share_links').insert({
      token,
      created_by: getOwnerId(),
      is_active: true,
    });
    if (!error) {
      return { token, createdAt: Date.now(), expiresAt: null, isActive: true };
    }
  }
  throw new Error('Não foi possível gerar o link.');
}

/** Revoga (is_active=false) ou reativa um link. Retorna a lista atualizada. */
export async function setShareLinkActive(token, isActive) {
  if (!isSupabaseEnabled) {
    const links = loadLocalLinks().map((l) => (l.token === token ? { ...l, isActive } : l));
    persistLocalLinks(links);
    return links;
  }
  await supabase
    .from('tank_share_links')
    .update({ is_active: isActive })
    .eq('token', token)
    .eq('created_by', getOwnerId());
  return loadShareLinks();
}

/** Exclui um link definitivamente. Retorna a lista atualizada. */
export async function deleteShareLink(token) {
  if (!isSupabaseEnabled) {
    const links = loadLocalLinks().filter((l) => l.token !== token);
    persistLocalLinks(links);
    return links;
  }
  await supabase
    .from('tank_share_links')
    .delete()
    .eq('token', token)
    .eq('created_by', getOwnerId());
  return loadShareLinks();
}

/** Valida token: existe, ativo e não expirado. Retorna o link ou null. */
export async function validateShareToken(token) {
  if (!isSupabaseEnabled) {
    const link = loadLocalLinks().find((l) => l.token === token);
    if (!link || !link.isActive) return null;
    if (link.expiresAt && Date.now() > link.expiresAt) return null;
    return link;
  }
  try {
    const { data, error } = await supabase
      .from('tank_share_links')
      .select('*')
      .eq('token', token)
      .maybeSingle();
    if (error || !data) return null;
    const link = toLink(data);
    if (!link.isActive) return null;
    if (link.expiresAt && Date.now() > link.expiresAt) return null;
    return link;
  } catch {
    return null;
  }
}

/** Dono (created_by) de um token válido. Null se inválido. */
export async function ownerOfToken(token) {
  if (!isSupabaseEnabled) return 'local';
  try {
    const { data, error } = await supabase
      .from('tank_share_links')
      .select('created_by, is_active, expires_at')
      .eq('token', token)
      .maybeSingle();
    if (error || !data || !data.is_active) return null;
    if (data.expires_at && Date.parse(data.expires_at) < Date.now()) return null;
    return data.created_by;
  } catch {
    return null;
  }
}

/** Balões do dono (nuvem). Retorna null se indisponível. */
export async function fetchOwnerBalloons(ownerId) {
  if (!isSupabaseEnabled || !ownerId || ownerId === 'local') return null;
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
