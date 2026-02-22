# Multi-stage build for BSC Nexus
FROM node:22-alpine AS builder

WORKDIR /app

# Copy dependency manifests and Prisma schema first for efficient caching
COPY package*.json ./
COPY tsconfig.json ./
COPY prisma ./prisma

# Install dependencies (skip prisma generate during install to control timing)
ENV PRISMA_SKIP_POSTINSTALL_GENERATE=1
RUN npm ci

# Generate Prisma client now that schema is present
RUN npx prisma generate

# Copy application source
COPY src ./src
COPY ultraFastSwapService.ts ./
COPY mevProtectionService.ts ./
COPY types.ts ./

# Build TypeScript -> dist
RUN npm run build

# Production runtime image
FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production

# Copy dependency manifests and install production deps only
COPY package*.json ./
RUN npm ci --omit=dev

# Copy built assets and necessary runtime files
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

# Expose application port
EXPOSE 3000

# Default command
CMD ["npm", "start"]
