# Étape 1 : Build de l'application React
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .

# ARME ABSOLUE : Exécution directe du fichier Javascript de Vite via Node
RUN node ./node_modules/vite/bin/vite.js build --outDir build

# Étape 2 : Serveur de production Nginx léger
FROM nginx:alpine
COPY --from=build /app/build /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]