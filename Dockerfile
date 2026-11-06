FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_APP_TIMEZONE=Asia/Manila
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
    NEXT_PUBLIC_APP_TIMEZONE=$NEXT_PUBLIC_APP_TIMEZONE \
    NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000 NEXT_TELEMETRY_DISABLED=1 NOTIFICATIONS_ENABLED=false
RUN groupadd --gid 10001 pcf && useradd --uid 10001 --gid pcf --no-create-home pcf
COPY --from=build --chown=pcf:pcf /app/.next/standalone ./
COPY --from=build --chown=pcf:pcf /app/.next/static ./.next/static
COPY --from=build --chown=pcf:pcf /app/public ./public
RUN mkdir -p .next/cache && chown -R pcf:pcf .next/cache
USER pcf
EXPOSE 3000
CMD ["node", "server.js"]
