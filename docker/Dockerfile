FROM python:3.12-alpine

RUN apk add --no-cache docker-cli openssh-client curl ca-certificates unzip nodejs npm \
    && apk add --no-cache --virtual .node-build build-base linux-headers \
    && ARCH="$(uname -m)" \
    && case "$ARCH" in x86_64) KARCH=amd64 ;; aarch64) KARCH=arm64 ;; *) echo "Unsupported architecture: $ARCH"; exit 1 ;; esac \
    && KVER="$(curl -fsSL https://dl.k8s.io/release/stable.txt)" \
    && curl -fsSL "https://dl.k8s.io/release/${KVER}/bin/linux/${KARCH}/kubectl" -o /usr/local/bin/kubectl \
    && chmod +x /usr/local/bin/kubectl \
    && pip install --no-cache-dir ansible-core docker kubernetes

WORKDIR /app
COPY ansible /app/ansible
COPY .config /app/.config
COPY web/package*.json /app/web/
RUN ansible-galaxy collection install --no-cache -r /app/ansible/requirements.yml \
    && npm ci --prefix /app/web \
    && apk del .node-build
COPY web /app/web
RUN npm --prefix /app/web run build \
    && npm --prefix /app/web prune --omit=dev \
    && node --check /app/web/server.js

EXPOSE 8787
ENV PORT=8787
ENTRYPOINT ["node", "/app/web/server.js"]
