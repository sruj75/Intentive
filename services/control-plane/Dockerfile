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
COPY packages/providers/package.json packages/providers/package.json
COPY services/control-plane/package.json services/control-plane/package.json

RUN pnpm install --frozen-lockfile

COPY packages/boundary packages/boundary
COPY packages/domain-types packages/domain-types
COPY packages/api-contract packages/api-contract
COPY packages/providers packages/providers
COPY services/control-plane services/control-plane

RUN pnpm --filter "@intentive/control-plane..." run build
RUN pnpm --filter @intentive/control-plane deploy --prod /app

FROM gcr.io/distroless/nodejs22-debian12:nonroot AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY --from=build /app /app

EXPOSE 8080
CMD ["dist/main.js"]
