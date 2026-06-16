FROM node:22-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@11.5.2 --activate

FROM base AS build
WORKDIR /repo

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json tsconfig.base.json ./
COPY packages/boundary/package.json packages/boundary/package.json
COPY packages/domain-types/package.json packages/domain-types/package.json
COPY packages/api-contract/package.json packages/api-contract/package.json
COPY packages/protocol/package.json packages/protocol/package.json
COPY packages/providers/package.json packages/providers/package.json
COPY services/agent-runtime/package.json services/agent-runtime/package.json

RUN pnpm install --frozen-lockfile

COPY packages packages
COPY services/agent-runtime services/agent-runtime

RUN pnpm --filter "@intentive/agent-runtime..." run build
RUN pnpm --filter @intentive/agent-runtime deploy --prod /app

FROM node:22-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY --from=build /app /app

USER node
EXPOSE 8080 8081
CMD ["node", "dist/main.js"]
