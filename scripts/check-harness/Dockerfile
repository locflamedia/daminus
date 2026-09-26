# Harness image for the read-only check run (scripts/check-harness/run.sh).
# A stock distro plus: a normal user, a project folder whose .env holds canary
# secrets, and shims for docker, pm2, mysql and psql that print recorded output
# (with canaries where the real tool would show secrets). Nothing else is
# installed: checks must work with what a minimal server has.
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
# A fake process environment with secrets, like a server's shell profile.
ENV CANARY_ENV_TOKEN=CANARY_process_env_7f3a \
    DB_PASSWORD=CANARY_process_db_password_91c2 \
    PATH=/opt/daminus-harness/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
USER daminus
WORKDIR /home/daminus
