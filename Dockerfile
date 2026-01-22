# FROM node:20-alpine

# WORKDIR /app

# COPY package*.json ./
# RUN npm install --production

# COPY . .

# EXPOSE 3000

# CMD ["npm", "start"]

FROM node:18-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production --no-optional && npm cache clean --force

COPY src/ ./src/
COPY .env ./

# Production stage - ЛЕГКИЙ образ!
FROM node:18-alpine AS production
WORKDIR /app

# Копируем только node_modules и код
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/src ./src
COPY --from=builder /app/.env ./

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

CMD ["node", "src/api.js"]
# Оптимизация использования памяти
# Используем переменные окружения для настройки лимитов памяти
# ENV NODE_OPTIONS="--max-old-space-size=256"