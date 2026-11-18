# syntax=docker/dockerfile:1

# Build stage: installs every dependency, including the TypeScript compiler,
# and compiles src/ to dist/.
FROM node:24.13.1-alpine3.23 AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

# Dependencies stage: only what the service needs at runtime, from the lockfile.
FROM node:24.13.1-alpine3.23 AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Runtime image: compiled code, runtime dependencies and migrations only. No
# sources, tests, compiler or .env, and it runs as the unprivileged node user.
FROM node:24.13.1-alpine3.23
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
COPY migrations ./migrations
# The commit the image was built from, reported by /health.
ARG GIT_SHA=dev
ENV GIT_SHA=$GIT_SHA
USER node
EXPOSE 8002
CMD ["node", "dist/server.js"]
