# Harness image for the read-only check run (scripts/check-harness/run.sh).
# A stock distro plus: a normal user, a project folder whose .env holds canary
# secrets, and shims for docker, pm2, dmesg, mysql and psql that print
# recorded output (with canaries where the real tool would show secrets).
# Nothing else is installed: checks must work with what a minimal server has.
#
# The project folder holds 50,000 small files (the server budget test), a
# node_modules folder the default skip paths leave out, and a 2 MiB upload
# for the large-files list (run.sh lowers the floor to 1 MB). ~/.pm2 is a
# mount point: run.sh puts a tmpfs there that looks like a running daemon's.
ARG BASE=ubuntu:24.04
FROM ${BASE}
RUN useradd --create-home --uid 1500 --shell /bin/sh daminus
COPY bin/ /opt/daminus-harness/bin/
COPY out/ /opt/daminus-harness/out/
COPY --chown=daminus:daminus home/ /home/daminus/
RUN chmod -R a+rX /opt/daminus-harness \
    && chmod 0755 /opt/daminus-harness/bin/* \
    && mv /home/daminus/app/env.canary /home/daminus/app/.env \
    && chmod 0600 /home/daminus/app/.env
RUN cd /home/daminus/app \
    && mkdir -p storage/logs public/uploads node_modules/pkg \
    && for d in $(seq 1 500); do mkdir -p "src/m$d"; done \
    && for d in $(seq 1 500); do (cd "src/m$d" && seq 1 100 | sed 's/$/.php/' | xargs touch); done \
    && seq 1 200 | sed 's/^/node_modules\/pkg\/f/' | xargs touch \
    && head -c 2097152 /dev/zero >public/uploads/banner.bin \
    && mkdir -p /home/daminus/.pm2 \
    && chown -R daminus:daminus /home/daminus
# A fake process environment with secrets, like a server's shell profile.
ENV CANARY_ENV_TOKEN=CANARY_process_env_7f3a \
    DB_PASSWORD=CANARY_process_db_password_91c2 \
    PATH=/opt/daminus-harness/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
USER daminus
WORKDIR /home/daminus
