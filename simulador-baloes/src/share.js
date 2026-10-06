// ============================================================
// Link ÚNICO de compartilhamento SOMENTE LEITURA.
// URL fixa: #/acompanhar/triangulo — o mesmo link para todo mundo.
// Os dados são do DONO FIXO da fábrica (todos os aparelhos veem e
// editam os mesmos balões). Sem lista, sem revogar, sempre ligado.
// ============================================================

export const SHARE_SLUG = 'triangulo';

/** URL pública única (hash route: funciona em qualquer hospedagem estática). */
export function buildShareUrl() {
  return `${window.location.origin}${window.location.pathname}#/acompanhar/${SHARE_SLUG}`;
}

/** Valida o slug: só 'triangulo' é válido (qualquer outro é inválido). */
export async function validateShareToken(token) {
  if (token === SHARE_SLUG) {
    return { token, createdAt: Date.now(), expiresAt: null, isActive: true };
  }
  return null;
}
