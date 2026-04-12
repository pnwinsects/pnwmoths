# Stage 1: download lychee binary
FROM debian:bookworm-slim AS lychee-builder
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates wget \
    && rm -rf /var/lib/apt/lists/*
ARG LYCHEE_VERSION=0.23.0
RUN wget -qO /tmp/lychee.tar.gz \
    "https://github.com/lycheeverse/lychee/releases/download/lychee-v${LYCHEE_VERSION}/lychee-x86_64-unknown-linux-gnu.tar.gz" \
    && tar -xzf /tmp/lychee.tar.gz -C /usr/local/bin \
    && chmod +x /usr/local/bin/lychee

# Stage 2: runtime image
FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
    git git-lfs ca-certificates \
    && git lfs install \
    && rm -rf /var/lib/apt/lists/*
COPY --from=lychee-builder /usr/local/bin/lychee /usr/local/bin/lychee
WORKDIR /workspace
