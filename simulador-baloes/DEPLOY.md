# Colocar o sistema no ar (Vercel — grátis)

O app usa rota com `#` (`#/acompanhar/:token`), então funciona em qualquer
hospedagem estática **sem** configuração de rewrites.

## Opção A — Pela web (recomendado, ~10 min)
1. Suba a pasta `simulador-baloes` para um repositório no **GitHub**
   (crie repo privado, arraste os arquivos pela web ou `git push`)
2. Acesse https://vercel.com → **Add New → Project** → importe o repo
3. Framework: **Vite** (detectado sozinho) → **Deploy**
4. Pronto: você ganha `https://simulador-baloes.vercel.app`
5. O link de acompanhamento vira:
   `https://simulador-baloes.vercel.app/#/acompanhar/a8Xk2p9Qz`

## Conectar a nuvem na produção
1. Na Vercel: **Project → Settings → Environment Variables**, adicione:
   - `VITE_SUPABASE_URL` = `https://xxx.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` = sua anon key
2. **Deployments → Redeploy** (o Vite embute as variáveis no build)
3. O selo no topo muda de **Local** para **☁️ Nuvem**

## Opção B — Netlify
1. https://app.netlify.com → **Add new site → Import** o repo
2. Build command: `npm run build` · Publish directory: `dist`
3. Mesmas variáveis de ambiente em **Site settings → Environment**
4. Deploy — mesmo formato de link com `#/acompanhar/:token`

## Conferir que está vivo
- Abra a URL → painel escuro com os 3 balões
- Gere um link em **Compartilhar → Testar link** → abre os balões só-leitura
- No celular (outra rede): só funciona com Supabase ligado (localhost não
  existe no celular; em produção use sempre a URL https)
