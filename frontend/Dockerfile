# Build stage
FROM node:18-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Serve stage using Nginx
FROM nginx:alpine
COPY --from=build /app/build /usr/share/nginx/html
# --- LA NOUVELLE LIGNE EST ICI ---
COPY nginx.conf /etc/nginx/conf.d/default.conf
# ---------------------------------
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]