# Cursor SDK はネイティブバイナリ（@cursor/sdk-linux-x64）を使うので glibc の slim イメージにする
FROM node:22-slim

WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY src ./src

# Worker（AgentContainer）からだけ呼ばれる。公開の入口はない
EXPOSE 8080
USER node
CMD ["node", "src/main.ts"]
