# Stage 1: download lychee binary
FROM debian:bookworm-slim AS lychee-builder
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates wget \
    && rm -rf /var/lib/apt/lists/*
ARG LYCHEE_VERSION=0.23.0
RUN wget -qO /tmp/lychee.tar.gz \
    "https://github.com/lycheeverse/lychee/releases/download/lychee-v${LYCHEE_VERSION}/lychee-x86_64-unknown-linux-gnu.tar.gz" \
    && echo "1fcb6ccf10d04c22b8c5873c5b9cb7be32ee7423e12169d6f1a79a6f1962ef81  /tmp/lychee.tar.gz" | sha256sum -c - \
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
