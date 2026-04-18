# Publicar o Podoquiro na Vercel

## O que já está no repositório

- `.env.example` — nomes das variáveis necessárias (copie para `.env.local` no PC).
- Build testado com `npm run build`.

## Passos na Vercel (uma vez)

1. Acesse [vercel.com](https://vercel.com) e faça login com GitHub.
2. **Add New → Project** → importe o repositório `Podoquiro`.
3. Antes do primeiro deploy, em **Settings → Environment Variables**, adicione para **Production** (e **Preview**, se quiser):

| Nome | Valor |
|------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | URL do projeto no Supabase (API) |
| `SUPABASE_SERVICE_ROLE_KEY` | Chave **service_role** (API) — secreta |
| `AUTH_SECRET` | String longa aleatória (ex.: 48+ caracteres) |

4. **Deploy**. A URL será algo como `https://podoquiro-xxx.vercel.app`.

## Banco de dados

- Rode as migrations do Supabase no **mesmo** projeto cujo URL você configurou (SQL Editor ou CLI).
- Pasta: `supabase/migrations/`.

## CLI (opcional)

```bash
npm i -g vercel
vercel login
vercel link
vercel env pull .env.local
```

Depois preencha `.env.local` e use `vercel --prod` para deploy pela linha de comando.

## Domínio próprio

**Project → Domains** na Vercel e siga as instruções de DNS.
