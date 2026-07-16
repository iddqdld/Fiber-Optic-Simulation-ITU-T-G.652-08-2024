FROM node:24.4.1-bookworm-slim

WORKDIR /app/apps/web
RUN chown -R node:node /app
COPY --chown=node:node apps/web/package.json apps/web/package-lock.json ./
USER node
RUN npm ci
COPY --chown=node:node apps/web/ ./
COPY --chown=node:node packages/shared_schemas/generated/api.ts /app/packages/shared_schemas/generated/api.ts
EXPOSE 5173
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 CMD ["node", "-e", "fetch('http://127.0.0.1:5173').then(response => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"]
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
