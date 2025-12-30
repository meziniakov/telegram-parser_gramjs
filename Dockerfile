FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --production

# RUN cp -r /app /app/shared-scripts/ || true

COPY . .

EXPOSE 3000

CMD ["npm", "start"]