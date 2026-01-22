# FROM node:20-alpine

# WORKDIR /app

# COPY package*.json ./
# RUN npm install --production

# COPY . .

# EXPOSE 3000

# CMD ["npm", "start"]

FROM node:18-alpine AS builder

WORKDIR /app

# Копируем только package файлы
COPY package*.json ./
RUN npm ci --only=production --no-optional \
    && npm cache clean --force

# Копируем только код
COPY . .

# Production stage
FROM node:18-alpine AS production

WORKDIR /app

# Копируем node_modules и код (БЕЗ .env!)
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/src ./src/

# Создаём .env из переменных окружения
RUN echo "NODE_ENV=$NODE_ENV" > .env \
    && echo "PORT=$PORT" >> .env \
    && echo "DB_HOST=$DB_HOST" >> .env \
    && echo "DB_PORT=$DB_PORT" >> .env \
    && echo "DB_NAME=$DB_NAME" >> .env \
    && echo "DB_USER=$DB_USER" >> .env \
    && echo "API_KEY=$API_KEY" >> .env

EXPOSE ${PORT:-3000}

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT:-3000}/api/health || exit 1

CMD ["node", "src/api.js"]
