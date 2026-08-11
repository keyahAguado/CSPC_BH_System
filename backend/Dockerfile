# 1. Use the official lightweight Node.js 18 runtime as a base image
FROM node:18-alpine

# 2. Set the working directory inside the container
WORKDIR /app

# 3. Copy package.json and package-lock.json first to leverage Docker build cache
COPY package*.json ./

# 4. Install production dependencies
RUN npm install

# 5. Copy the rest of the backend source code
COPY . .

# 6. Change ownership of application directories to the unprivileged node user
RUN chown -R node:node /app

# 7. Expose the port your Express app listens on
EXPOSE 3000

# 8. Switch security context to the unprivileged user
USER node

# 9. Start your backend server standardly
CMD ["node", "index.js"]