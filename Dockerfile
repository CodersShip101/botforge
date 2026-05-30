FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install --production

# Copy application
COPY . .

# Create data directory with proper permissions
RUN mkdir -p /app/backend/data

# Use Railway volume for persistence when available,
# otherwise fall back to local data directory
ENV DB_PATH=/app/backend/data/botforge.db

EXPOSE 5000

CMD ["node", "backend/server.js"]
