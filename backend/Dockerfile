FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY backend ./backend
COPY src ./src
COPY contracts ./contracts
COPY data ./data

ENV NODE_ENV=production
EXPOSE 8787

CMD ["node", "backend/src/server.js"]
