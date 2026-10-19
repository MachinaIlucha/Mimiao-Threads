FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine AS runtime
WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json tsconfig.json ./
COPY --chown=node:node server ./server
COPY --chown=node:node shared ./shared
COPY --chown=node:node scripts ./scripts
RUN mkdir -p /app/data/media && chown -R node:node /app/data
USER node
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4319 MEDIA_DIR=/app/data/media
EXPOSE 4319
CMD ["npm","start"]
