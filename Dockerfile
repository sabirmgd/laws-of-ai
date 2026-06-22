FROM node:22-alpine
WORKDIR /app

COPY dist ./dist
COPY server.mjs ./

RUN test -f dist/index.html && test -f dist/edition.html

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- http://127.0.0.1:8080/ >/dev/null 2>&1 || exit 1

CMD ["node", "server.mjs"]
