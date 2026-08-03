#!/bin/sh
# ==========================================================
# generate-config.sh
# Gera assets/js/config.js a partir de variáveis de ambiente
# (SUPABASE_URL e SUPABASE_ANON_KEY).
#
# Uso local: crie um .env na raiz (veja .env.example) e rode:
#   sh scripts/generate-config.sh
#
# No EasyPanel (Nixpacks): defina SUPABASE_URL e SUPABASE_ANON_KEY
# nas variáveis de ambiente do app, e configure o "Build Command" do
# app para:
#   sh scripts/generate-config.sh
# Assim o nginx padrão do Nixpacks continua servindo os arquivos
# normalmente, só que já com o config.js atualizado antes do build.
# ==========================================================

set -e

# Carrega .env da raiz, se existir (uso local/manual).
if [ -f .env ]; then
  set -a
  . ./.env
  set +a
fi

SUPABASE_URL="${SUPABASE_URL:-}"
SUPABASE_ANON_KEY="${SUPABASE_ANON_KEY:-}"

if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_ANON_KEY" ]; then
  echo "[generate-config] Aviso: SUPABASE_URL e/ou SUPABASE_ANON_KEY não definidas." >&2
  echo "[generate-config] assets/js/config.js será gerado com placeholders." >&2
fi

mkdir -p assets/js

cat > assets/js/config.js << EOF
/* ==========================================================
   config.js — GERADO AUTOMATICAMENTE por scripts/generate-config.sh
   a partir das variáveis de ambiente SUPABASE_URL e SUPABASE_ANON_KEY.
   Não edite este arquivo direto em produção: ele é sobrescrito a
   cada build. Para uso local, edite o .env na raiz do projeto.
   ========================================================== */

window.SM_CONFIG = {
  SUPABASE_URL: "${SUPABASE_URL}",
  SUPABASE_ANON_KEY: "${SUPABASE_ANON_KEY}"
};
EOF

echo "[generate-config] assets/js/config.js atualizado."
