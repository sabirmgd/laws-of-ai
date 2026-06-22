FROM node:22-alpine AS build
WORKDIR /app
ENV PRODUCT_PUBLIC_ENABLED=true \
  FREE_EDITION_ENABLED=true \
  PAYMENT_TEST_ENABLED=false

RUN apk add --no-cache zip

COPY data ./data
COPY src ./src
COPY lib ./lib
COPY pdf/assets ./pdf/assets
COPY product ./product
COPY scripts ./scripts
COPY build.mjs ./

RUN node build.mjs && node scripts/build-product-kit.mjs

FROM node:22-alpine
WORKDIR /app
ENV PRODUCT_PUBLIC_ENABLED=true \
  FREE_EDITION_ENABLED=true \
  PAYMENT_TEST_ENABLED=false

COPY --from=build /app/dist ./dist
COPY --from=build /app/product/ai-agent-audit-kit/build/ai-agent-audit-kit-50-laws-edition ./product/ai-agent-audit-kit/build/ai-agent-audit-kit-50-laws-edition
COPY --from=build /app/product/ai-agent-audit-kit/releases/ai-agent-audit-kit-50-laws-edition.zip ./product/ai-agent-audit-kit/releases/ai-agent-audit-kit-50-laws-edition.zip
COPY server.mjs ./

RUN test -f dist/index.html && test -f dist/edition.html
RUN test -f product/ai-agent-audit-kit/build/ai-agent-audit-kit-50-laws-edition/START-HERE.md \
  && test -f product/ai-agent-audit-kit/build/ai-agent-audit-kit-50-laws-edition/ai-agent-audit/SKILL.md \
  && test -f product/ai-agent-audit-kit/build/ai-agent-audit-kit-50-laws-edition/ai-agent-audit/assets/platform-intake.md \
  && test -f product/ai-agent-audit-kit/releases/ai-agent-audit-kit-50-laws-edition.zip

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- http://127.0.0.1:8080/ >/dev/null 2>&1 || exit 1

CMD ["node", "server.mjs"]
