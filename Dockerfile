# Web POS image for Cloud Run. VITE_* values are compiled into the JavaScript,
# so they must be passed as build args (see cloudbuild.yaml); setting them as
# Cloud Run environment variables has no effect.
FROM node:22-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
