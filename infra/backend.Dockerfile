# Build Fastify backend
FROM node:20-alpine AS builder
WORKDIR /app
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

COPY package.json pnpm-workspace.yaml ./
COPY backend/package.json backend/package.json
COPY shared/package.json shared/package.json
RUN pnpm install --frozen-lockfile || pnpm install

COPY . .
RUN pnpm --filter @podster/shared build
RUN pnpm --filter @podster/backend build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

COPY --from=builder /app/backend/dist ./dist
COPY --from=builder /app/backend/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules

EXPOSE 4000
CMD ["pnpm", "start"]
