# syntax=docker/dockerfile:1
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
RUN npm install --omit=dev

COPY . .

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "server.js"]
