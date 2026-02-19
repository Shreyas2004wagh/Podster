# Build Next.js frontend
FROM node:20-alpine AS builder
WORKDIR /app
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY frontend/package.json frontend/package.json
COPY shared/package.json shared/package.json
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm --filter @podster/shared build
RUN pnpm --filter frontend build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

COPY --from=builder /app/frontend/.next ./.next
COPY --from=builder /app/frontend/package.json ./package.json
COPY --from=builder /app/frontend/public ./public
COPY --from=builder /app/frontend/node_modules ./node_modules

EXPOSE 3000
CMD ["pnpm", "start"]
