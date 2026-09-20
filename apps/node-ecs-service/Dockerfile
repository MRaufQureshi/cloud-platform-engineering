# Example 1
# FROM node:22-slim
# WORKDIR /app
# COPY . .
# RUN npm ci
# EXPOSE 3000
# CMD [ "node", "server.js" ]
# it's the naive version kept for comparison

# Example 2
FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
EXPOSE 3000
# --interval: how often to check   --timeout: how long to wait for a reply
# --start-period: grace period while the app boots (failures here don't count)
# --retries: consecutive failures before marking unhealthy
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
CMD node -e "fetch('http://localhost:3000/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

# build-time only. Gone after the build ends.
ARG BUILD_VERSION=dev          
# runtime. Every container from this image gets it.
ENV NODE_ENV=production        
# copies the build-time value into a runtime one
ENV APP_BUILD=$BUILD_VERSION   

USER node
# ENTRYPOINT [ "node" ]
CMD [ "node","server.js" ]