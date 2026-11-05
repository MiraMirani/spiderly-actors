FROM apify/actor-node:20
COPY package*.json ./
RUN npm install --omit=dev --omit=optional --no-audit --no-fund && npm cache clean --force
COPY . ./
CMD ["npm", "start", "--silent"]
