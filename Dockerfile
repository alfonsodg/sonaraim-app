# Stage 1: Build and verification stage
FROM node:22-alpine AS builder

WORKDIR /workspace

COPY package.json ./
COPY src/ ./src/
COPY tests/ ./tests/

# Verify unit and integration test suite during build
RUN npm test

# Stage 2: Minimal production runtime for Instant Web / App Clip service
FROM node:22-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production \
    SONARAIM_APP_HOST=0.0.0.0 \
    SONARAIM_APP_PORT=8080

RUN addgroup -S sonaraim && adduser -S sonaraim -G sonaraim

COPY --from=builder --chown=sonaraim:sonaraim /workspace/package.json ./package.json
COPY --from=builder --chown=sonaraim:sonaraim /workspace/src ./src

USER sonaraim

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "const p=process.env.SONARAIM_APP_PORT||process.env.APP_WEB_PORT; fetch('http://127.0.0.1:'+p+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/main.mjs"]
