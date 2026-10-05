# Subir o banco no Supabase (passo a passo)

## O que você precisa enviar ao Supabase

Só **1 arquivo**: `supabase/schema.sql` (tabelas `tanks` + `tank_share_links` + RLS).

## Passo 1 — Criar o projeto (5 min)
1. Acesse https://supabase.com → **New project**
2. Nome: `simulador-baloes` → anote a senha do banco → Create
3. Aguarde o projeto ficar verde (Active)

## Passo 2 — Criar as tabelas (2 min)
1. No menu lateral: **SQL Editor → New query**
2. Abra o arquivo `supabase/schema.sql` deste projeto, copie **tudo**
3. Cole no editor, clique em **Run** (ou Ctrl+Enter)
4. Confirme: **Table Editor** deve mostrar `tanks` e `tank_share_links`

## Passo 3 — Pegar as chaves (1 min)
1. **Settings (engrenagem) → API**
2. Copie: **Project URL** (`https://xxx.supabase.co`) e **anon key** (`sb_publishable_...` ou `eyJ...`)

## Passo 4 — Ligar o app na nuvem
1. Na pasta do projeto, copie `.env.example` para `.env`
2. Preencha com a URL e a anon key
3. Rode `npm run dev` de novo (o Vite só lê o `.env` ao iniciar)
4. No topo do painel aparece **☁️ Nuvem** (antes: Local)

## Como funciona depois de ligado
- Painel **sobe** os 3 balões a cada ~2,5s (upsert por dono+balão)
- Ao abrir, **baixa** da nuvem (a nuvem vence o local)
- Botão **Compartilhar** grava links na nuvem; a página `#/acompanhar/:token`
  valida o token e lê os balões do dono a cada 5s — **funciona em outro celular**
- Sem `.env`, tudo continua no LocalStorage (nada quebra)

## (Opcional) Edge Function de leitura pública
O app já lê direto pelas tabelas (RLS modo simples). Se quiser endurecer,
faça deploy de `supabase/functions/get-tanks-by-share-token`:
```bash
npm i -g supabase
supabase login
supabase link --project-ref SEU_PROJECT_REF
supabase functions deploy get-tanks-by-share-token
```

## Segurança
O `schema.sql` vem em **modo simples (sem login)**: quem tiver a anon key
pode ler/gravar. Para produção com login, use o modelo comentado no final
do SQL (policies por `auth.uid()`).
