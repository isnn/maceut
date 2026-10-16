# web/Dockerfile — production, multi-stage (`next build` + `next start`).
#
# NEXT_PUBLIC_* values are compiled into the browser bundle by `next build`, so they must
# be present at BUILD time: put them in web/.env.production on the server (copy from
# web/.env.production.example) before `docker compose ... up --build`. Changing them means
# rebuilding the image, not restarting it.
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build && npm prune --omit=dev

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.ts ./

USER node
EXPOSE 3000
CMD ["npx", "next", "start", "-p", "3000"]
