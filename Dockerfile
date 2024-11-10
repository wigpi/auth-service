# Stage 1: Build dependencies
FROM node:20-alpine AS build
LABEL org.opencontainers.image.description "A simple Node.js web server that uses Puppeteer to auth users to apereo cas of wigor"

# Set the working directory
WORKDIR /app

# Copy package.json and package-lock.json to install dependencies
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application files
COPY . .

# Stage 2: Puppeteer runtime
FROM node:20-alpine AS puppeteer
WORKDIR /app

# Install only the necessary Puppeteer dependencies
RUN apk add --no-cache \
    chromium \
    freetype \
    harfbuzz \
    nss \
    ttf-freefont \
    && rm -rf /var/cache/*

# Set the Chromium executable path for Puppeteer
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Copy node_modules and application code from the build stage
COPY --from=build /app /app

# Expose the port your app runs on
EXPOSE 3000

# Command to run the server
CMD [ "node", "server.js" ]
