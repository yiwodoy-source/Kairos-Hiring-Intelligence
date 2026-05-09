# ── Stage 1: build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci --ignore-scripts

COPY tsconfig.json vite.config.ts tailwind.config.js postcss.config.js index.html ./
COPY src ./src
COPY components ./components
COPY services ./services
COPY types.ts App.tsx index.tsx vite-env.d.ts ./

# VITE_API_URL is injected at build time so the static bundle knows where the backend is
ARG VITE_API_URL=http://localhost:3001
ENV VITE_API_URL=$VITE_API_URL

RUN npm run build

# ── Stage 2: runtime (nginx) ──────────────────────────────────────────────────
FROM nginx:1.27-alpine AS runtime

# Remove default nginx config and serve the Vite build
RUN rm /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html

# Minimal nginx config: serve SPA, proxy /api to backend
COPY nginx.conf /etc/nginx/conf.d/app.conf

EXPOSE 3003

CMD ["nginx", "-g", "daemon off;"]
