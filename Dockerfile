# syntax=docker/dockerfile:1

# ---------- etapa 1: compila o painel React (client/dist) ----------
FROM node:20-slim AS build-client
WORKDIR /app
ENV PUPPETEER_SKIP_DOWNLOAD=true
COPY package*.json ./
RUN npm ci
COPY client ./client
COPY shared ./shared
RUN npm run build

# ---------- etapa 2: runtime ----------
FROM node:20-slim

# Chromium do proprio repositorio Debian, ja com todas as bibliotecas
# compartilhadas necessarias (libnss3, libatk, libgbm etc.) resolvidas
# automaticamente pelo apt — evita os dois problemas que tinhamos antes:
# 1) Puppeteer baixando o Chrome do Google durante o build (rede instavel
#    em alguns ambientes de build) e 2) esse Chrome baixado nao rodar em
#    imagens baseadas em Alpine (musl libc incompativel).
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

# Evita que o `npm install` do Puppeteer tente baixar o proprio Chromium —
# vamos usar o do sistema instalado acima.
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .
COPY --from=build-client /app/client/dist ./client/dist

ENV NODE_ENV=production
EXPOSE 3000

# tsx executa o servidor TypeScript diretamente (dependência de runtime,
# ver package.json) — não há etapa de transpilação do servidor.
CMD ["npx", "tsx", "server/index.ts"]
