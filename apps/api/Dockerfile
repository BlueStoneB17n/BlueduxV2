FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /repo

FROM base AS build
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages packages
COPY apps/api apps/api
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @bluedux/api build
RUN pnpm --filter @bluedux/api --prod deploy /out

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out/dist /app/dist
COPY --from=build /out/node_modules /app/node_modules
COPY --from=build /out/package.json /app/package.json
EXPOSE 8080
CMD ["node", "dist/index.js"]
