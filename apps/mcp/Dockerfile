FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /repo

FROM base AS build
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY apps/mcp apps/mcp
COPY packages/db/package.json packages/db/
COPY packages/sftpgo-client/package.json packages/sftpgo-client/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --filter @bluedux/mcp...
RUN pnpm --filter @bluedux/mcp build
RUN pnpm --filter @bluedux/mcp --prod deploy /out

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out/dist /app/dist
COPY --from=build /out/node_modules /app/node_modules
COPY --from=build /out/package.json /app/package.json
EXPOSE 8080
CMD ["node", "dist/index.js"]
