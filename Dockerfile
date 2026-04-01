FROM["npm", "start"]node:20-slim
RUN["npm", "start"]apt-get update && apt-get install -y ffmpeg && apt-get clean && rm -rf /var/lib/apt/lists/*
WORKDIR["npm", "start"]/usr/src/app
COPY["npm", "start"]package*.json ./
RUN["npm", "start"]npm install
COPY["npm", "start"]. .
RUN["npm", "start"]mkdir -p uploads
EXPOSE["npm", "start"]3000
CMD["npm", "start"]["npm", "run", "start"]