FROM node:20-slim

# Install FFmpeg
RUN apt-get update &&     apt-get install -y ffmpeg &&     apt-get clean &&     rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /usr/src/app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy app source
COPY . .

# Create uploads directory (for local testing, though /tmp is used in server.js)
RUN mkdir -p uploads

# Expose port
EXPOSE 3000

# Start the application
CMD [ "npm", "start" ]
