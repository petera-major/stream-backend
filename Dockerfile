# Use Node 18 base image
FROM node:18

# Install FFmpeg
RUN apt update && apt install -y ffmpeg

# Set working directory
WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Expose Railway's dynamic port
ENV PORT=8080
EXPOSE 8080

CMD ["node", "server.js"]
