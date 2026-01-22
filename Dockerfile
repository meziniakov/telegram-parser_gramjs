# FROM node:20-alpine

# WORKDIR /app

# COPY package*.json ./
# RUN npm install --production

# COPY . .

# EXPOSE 3000

# CMD ["npm", "start"]

FROM node:20-alpine AS builder

WORKDIR /app

# Копируем только package файлы
COPY package*.json ./
RUN npm install --production --no-optional --no-fund --no-audit \
    && npm cache clean --force \
    && rm -rf ~/.npm

# Копируем только код
COPY . .

EXPOSE 3000

CMD ["node", "src/api.js"]
