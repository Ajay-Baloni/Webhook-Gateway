# Development image — source is bind-mounted by docker-compose for hot reload.
# Debian (not alpine): it ships OpenSSL/libssl3, which Prisma's engines require.
# Alpine needs a separate `apk add openssl`, which depends on a flaky package
# mirror; the full node image avoids that entirely.
FROM node:20

WORKDIR /app

# Install dependencies first to leverage Docker layer caching.
COPY package*.json ./
RUN npm install

# Generate the Prisma client (needs the schema). The compose command also
# regenerates at runtime so schema edits during dev are picked up.
COPY prisma ./prisma
RUN npx prisma generate

# Copy the rest (overridden by the bind mount at runtime, useful for `docker build` alone).
COPY . .

EXPOSE 3000

CMD ["npm", "run", "start:dev"]
