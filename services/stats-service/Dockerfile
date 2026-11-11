FROM node:26.13.0-alpine3.24

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./

RUN npm ci --omit=dev && npm cache clean --force && \
    rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx

COPY src ./src

USER node

EXPOSE 8080

CMD ["node", "src/server.js"]

LABEL org.opencontainers.image.source="https://github.com/bukovinszkiakos/k8s-microservices-helm-ci" 

