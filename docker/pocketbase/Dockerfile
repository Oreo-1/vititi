# syntax=docker/dockerfile:1
FROM alpine:3.20

# PocketBase release to download (https://github.com/pocketbase/pocketbase/releases).
ARG PB_VERSION=0.40.6
# Set automatically by BuildKit (amd64 / arm64 / arm).
ARG TARGETARCH

RUN apk add --no-cache ca-certificates unzip wget \
 && case "${TARGETARCH:-amd64}" in \
      amd64) PB_ARCH=amd64 ;; \
      arm64) PB_ARCH=arm64 ;; \
      arm)   PB_ARCH=armv7 ;; \
      *) echo "unsupported arch: ${TARGETARCH}" >&2; exit 1 ;; \
    esac \
 && wget -q -O /tmp/pb.zip "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_${PB_ARCH}.zip" \
 && mkdir -p /pb \
 && unzip -q /tmp/pb.zip pocketbase -d /pb \
 && chmod +x /pb/pocketbase \
 && rm /tmp/pb.zip

WORKDIR /pb

# Collections + API rules, and the migration that imports them on first start.
COPY pocketbase/pb_schema.json /pb/pb_schema.json
COPY docker/pocketbase/pb_migrations/ /pb/pb_migrations/
COPY docker/pocketbase/entrypoint.sh /pb/entrypoint.sh
RUN chmod +x /pb/entrypoint.sh

ENV PB_SCHEMA_FILE=/pb/pb_schema.json

# All persistent state (SQLite DB, uploaded maps/tokens, backups) lives here.
VOLUME /pb/pb_data
EXPOSE 8090

HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=5 \
  CMD wget -q -O /dev/null http://127.0.0.1:8090/api/health || exit 1

ENTRYPOINT ["/pb/entrypoint.sh"]
