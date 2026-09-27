# api/Dockerfile — production, multi-stage
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .
RUN npm run build

# Drop devDependencies once the build is done — tsx, vitest, eslint and the type
# packages are all build-time only and have no business in the runtime image.
RUN npm prune --omit=dev

FROM node:20-alpine AS runner
WORKDIR /app

RUN apk add --no-cache chromium nss freetype harfbuzz ca-certificates ttf-freefont
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium
ENV NODE_ENV=production

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/drizzle ./drizzle
COPY package.json ./

# Don't run as root. node:alpine ships a `node` user for exactly this.
USER node

EXPOSE 8080
# dist/src/, not dist/ — tsconfig's rootDir is the package root so that src/ can
# import drizzle/schema.ts, which sits beside src/ rather than inside it.
CMD ["node", "dist/src/server.js"]
