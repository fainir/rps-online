FROM node:20-alpine

WORKDIR /app

# Install production deps first (better layer caching)
COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund

# App source
COPY . .

ENV NODE_ENV=production
# Railway injects PORT; server falls back to 3000 locally.
EXPOSE 3000

CMD ["node", "server.js"]
