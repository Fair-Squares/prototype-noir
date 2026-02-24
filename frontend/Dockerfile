FROM node:22-slim AS base

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm install

# Copy source
COPY . .

# Environment
ENV NEXT_PUBLIC_DEV_MODE=true
ENV NEXT_PUBLIC_SIMULATION=true
ENV NEXT_TELEMETRY_DISABLED=1

EXPOSE 3000

# Dev server for prototype (use `next build && next start` for production)
CMD ["npm", "run", "dev"]
