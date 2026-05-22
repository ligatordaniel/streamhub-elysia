FROM oven/bun:1

WORKDIR /workspace/frontend

COPY package.json ./
RUN bun install

COPY tsconfig.json ./
COPY vite.config.ts ./
COPY index.html ./
COPY src ./src

EXPOSE 5173

CMD ["bun", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173", "--strictPort"]