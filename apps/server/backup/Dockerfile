FROM postgres:17-bookworm

RUN apt-get update \
    && apt-get install -y --no-install-recommends awscli ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY apps/server/backup/run-backup.sh /usr/local/bin/blumi-run-backup
COPY apps/server/backup/check-freshness.sh /usr/local/bin/blumi-check-backup-freshness
RUN chmod 0555 /usr/local/bin/blumi-run-backup /usr/local/bin/blumi-check-backup-freshness

USER postgres
ENTRYPOINT ["/usr/local/bin/blumi-run-backup"]
