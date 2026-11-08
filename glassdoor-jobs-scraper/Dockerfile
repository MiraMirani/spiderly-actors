FROM mcr.microsoft.com/playwright:v1.58.2-noble
WORKDIR /app
COPY requirements.txt ./
RUN apt-get update && apt-get install -y --no-install-recommends python3-venv && rm -rf /var/lib/apt/lists/* \
    && python3 -m venv /opt/glassdoor-python && /opt/glassdoor-python/bin/pip install --no-cache-dir -r requirements.txt
ENV PATH="/opt/glassdoor-python/bin:${PATH}"
COPY package*.json ./
RUN npm ci --omit=dev
RUN npx playwright install chrome
COPY . ./
CMD ["node", "src/main.js"]
