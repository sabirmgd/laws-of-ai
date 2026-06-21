# ---- build stage: pre-render the SEO-optimized static site ----
FROM node:22-alpine AS build
WORKDIR /app
COPY data ./data
COPY src ./src
COPY lib ./lib
COPY pdf/assets ./pdf/assets
COPY build.mjs ./
RUN node build.mjs

# ---- serve stage: static site + newsletter API on 8080 for Cloud Run ----
FROM node:22-alpine
WORKDIR /app

COPY --from=build /app/dist ./dist
COPY server.mjs ./

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- http://127.0.0.1:8080/ >/dev/null 2>&1 || exit 1

CMD ["node", "server.mjs"]
