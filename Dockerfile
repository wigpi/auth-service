# Use the official Node.js 20 image as a parent image
FROM node:20-alpine
LABEL org.opencontainers.image.description "A simple Node.js web server that uses Puppeteer to auth users to apereo cas of wigor"

# Set the working directory
WORKDIR /app

# Copy the application files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of your app's source code from your host to your image filesystem.
COPY . .

# Puppeteer dependencies
RUN apk add --no-cache \
    chromium \
    freetype \
    harfbuzz \
    nss \
    ttf-freefont \
    && rm -rf /var/cache/*

# Set the Chromium executable path for Puppeteer
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Tell Docker about the port we'll run on.
EXPOSE 3000

# Command to run the server
CMD [ "node", "server.js" ]
