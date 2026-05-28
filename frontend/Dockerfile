FROM node:22-slim AS deps
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

FROM node:22-slim AS builder
WORKDIR /app/frontend
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_WS_URL
ARG NEXT_PUBLIC_BASE_PATH
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL
ENV NEXT_PUBLIC_BASE_PATH=$NEXT_PUBLIC_BASE_PATH
COPY --from=deps /app/frontend/node_modules ./node_modules
COPY frontend/ ./
RUN npm run build

FROM node:22-slim AS runner
WORKDIR /app/frontend
ENV NODE_ENV=production
ENV PORT=3005
ENV HOSTNAME=0.0.0.0
ENV NODE_OPTIONS=--max-old-space-size=192
COPY --from=builder /app/frontend/public ./public
COPY --from=builder /app/frontend/.next/static ./.next/static
COPY --from=builder /app/frontend/.next/standalone ./

EXPOSE 3005
CMD ["node", "server.js"]
