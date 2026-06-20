# ---- build stage: pre-render the SEO-optimized static site ----
FROM node:22-alpine AS build
WORKDIR /app
COPY data ./data
COPY src ./src
COPY build.mjs ./
RUN node build.mjs

# ---- serve stage: nginx on 8080 for Cloud Run ----
FROM nginx:1.27-alpine

RUN rm /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/laws.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- http://127.0.0.1:8080/ >/dev/null 2>&1 || exit 1

CMD ["nginx", "-g", "daemon off;"]
