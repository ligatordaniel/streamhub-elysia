FROM oven/bun:1

WORKDIR /workspace/backend

COPY package.json ./
COPY tsconfig.json ./
COPY src ./src

RUN bun install

EXPOSE 3012

CMD ["bun", "run", "dev"]