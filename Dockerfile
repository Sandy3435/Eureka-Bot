FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
RUN mkdir -p data/auth
ENV NODE_ENV=production
CMD ["node", "src/index.js"]