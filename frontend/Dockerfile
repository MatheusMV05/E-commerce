FROM node:20-alpine AS build
WORKDIR /app
ARG VITE_GATEWAY_URL=http://localhost:8000
ENV VITE_GATEWAY_URL=$VITE_GATEWAY_URL
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 5173
