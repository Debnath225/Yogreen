FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY backend/package.json ./package.json
COPY backend/package-lock.json ./package-lock.json
RUN npm ci --omit=dev
COPY backend/src ./src
USER node
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=3s CMD wget -qO- http://127.0.0.1:4000/health || exit 1
CMD ["node", "src/index.js"]
