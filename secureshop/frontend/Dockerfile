FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json .npmrc ./
RUN npm ci --legacy-peer-deps --no-audit --no-fund

COPY . .
RUN npm run build

FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html
COPY docker-entrypoint-secureshop.sh /docker-entrypoint.d/99-secureshop-config.sh
RUN chmod +x /docker-entrypoint.d/99-secureshop-config.sh

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
