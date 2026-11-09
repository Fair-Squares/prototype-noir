FROM ubuntu:24.04 AS base

# Install Node.js 24
RUN apt-get update && \
    apt-get install -y curl && \
    curl -fsSL https://deb.nodesource.com/setup_24.x | bash - && \
    apt-get install -y nodejs && \
    rm -rf /var/lib/apt/lists/*

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
