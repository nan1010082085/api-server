FROM node:20-slim AS base
RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /app

# Install dependencies
COPY flow-shared/package.json flow-shared/pnpm-lock.yaml flow-shared/
COPY ai/shared/package.json ai/shared/pnpm-lock.yaml ai/shared/
COPY server/package.json server/pnpm-lock.yaml server/
RUN cd flow-shared && pnpm install --frozen-lockfile && cd ../..
RUN cd ai/shared && pnpm install --frozen-lockfile && cd ../..
RUN cd server && pnpm install --frozen-lockfile

# Copy source and build shared packages
COPY flow-shared/ flow-shared/
COPY ai/shared/ ai/shared/
RUN cd flow-shared && pnpm build
RUN cd ai/shared && pnpm build

# Copy server source and build
COPY server/ server/
RUN cd server && pnpm build

# Production stage
FROM node:20-slim
RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /app

COPY --from=base /app/flow-shared/dist ./flow-shared/dist
COPY --from=base /app/flow-shared/package.json ./flow-shared/
COPY --from=base /app/ai/shared/dist ./ai/shared/dist
COPY --from=base /app/ai/shared/package.json ./ai/shared/
COPY --from=base /app/ai/shared/metadata.json ./ai/shared/
COPY --from=base /app/server/dist ./server/dist
COPY --from=base /app/server/package.json /app/server/pnpm-lock.yaml ./server/
COPY --from=base /app/server/node_modules ./server/node_modules
COPY --from=base /app/server/config ./server/config

WORKDIR /app/server
EXPOSE 3001
CMD ["node", "dist/index.js"]
