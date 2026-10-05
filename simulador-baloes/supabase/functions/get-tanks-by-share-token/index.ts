// Edge Function: get-tanks-by-share-token
// GET /functions/v1/get-tanks-by-share-token?token=a8Xk2p9Qz
// Retorna SOMENTE os dados de leitura dos 3 tanques do dono do link.
// Deploy: supabase functions deploy get-tanks-by-share-token

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors });
  }

  const url = new URL(req.url);
  const token = (url.searchParams.get('token') || '').trim();

  if (!token || token.length > 64) {
    return Response.json({ error: 'Token inválido.' }, { status: 400, headers: cors });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, // server-side: valida o link
  );

  // 1) Valida o token: existe, ativo e não expirado
  const { data: link, error: linkError } = await supabase
    .from('tank_share_links')
    .select('created_by, is_active, expires_at')
    .eq('token', token)
    .maybeSingle();

  if (linkError || !link || !link.is_active || (link.expires_at && new Date(link.expires_at) < new Date())) {
    return Response.json({ error: 'Link inválido, expirado ou revogado.' }, { status: 404, headers: cors });
  }

  // 2) Busca os 3 tanques do dono — APENAS campos de leitura
  const { data: tanks, error: tanksError } = await supabase
    .from('tanks')
    .select('balloon_id, name, capacity, current_level, initial_level, product_id, machine_ids, machine_flow, is_running, estimated_finish_at, cip_hours, cip_done_at, cip_washing, cip_wash_ends_at, cip_wash_minutes, form_recipe, form_product_id, form_target_liters, form_running, form_start_at, form_accum_ms, form_done, updated_at')
    .eq('owner_id', link.created_by)
    .order('balloon_id');

  if (tanksError) {
    return Response.json({ error: 'Falha ao buscar tanques.' }, { status: 500, headers: cors });
  }

  return Response.json(
    { tanks, server_time: new Date().toISOString() },
    { headers: { ...cors, 'Cache-Control': 'no-store' } },
  );
});
