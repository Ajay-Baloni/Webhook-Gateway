# Development image — source is bind-mounted by docker-compose for hot reload.
FROM node:20-alpine

WORKDIR /app

# Install dependencies first to leverage Docker layer caching.
COPY package*.json ./
RUN npm install

# Copy the rest (overridden by the bind mount at runtime, useful for `docker build` alone).
COPY . .

EXPOSE 3000

CMD ["npm", "run", "start:dev"]
