# 1. Use the supported Node.js 24 LTS runtime.
FROM node:24-alpine

# 2. Set the working directory inside the container
WORKDIR /app

# 3. Copy package.json and package-lock.json first to leverage Docker build cache
COPY package*.json ./

# 4. Install production dependencies
RUN npm ci --omit=dev

# 5. Copy the rest of the backend source code
COPY --chown=node:node . .

# 6. Give the unprivileged process write access only to its upload directory.
#    /app/uploads is created here so a fresh media_uploads volume inherits node ownership
#    (otherwise Docker creates the mount point as root and every upload fails with EACCES).
RUN mkdir -p /app/uploads && chown node:node /app/uploads

# 7. Expose the port your Express app listens on
EXPOSE 3000

# 8. Switch security context to the unprivileged user
USER node

# 9. Start your backend server standardly
CMD ["node", "index.js"]