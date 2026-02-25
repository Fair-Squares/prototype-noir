FROM node:22-slim AS base

RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm install

# Copy source
COPY . .

# Defaults (overridden by docker-compose environment per profile)
ENV NEXT_PUBLIC_DEV_MODE=true
ENV NEXT_PUBLIC_SIMULATION=true
ENV NEXT_TELEMETRY_DISABLED=1

EXPOSE 3000

CMD ["npm", "run", "dev"]
