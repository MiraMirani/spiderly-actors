FROM mcr.microsoft.com/playwright:v1.58.2-noble
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . ./
CMD ["node", "src/main.js"]
