FROM apify/actor-node:22
COPY package*.json ./
RUN npm ci --omit=dev --omit=optional --no-audit --no-fund && npm cache clean --force
COPY . ./
CMD ["npm", "start", "--silent"]
