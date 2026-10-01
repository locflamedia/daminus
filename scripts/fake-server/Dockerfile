# A fake server for the setup flow (scripts/fake-server/e2e.sh): sshd, a user
# that logs in with a key, an nginx config with sites, docker, pm2, mysql and
# psql shims that print recorded output, a pm2 daemon stand-in, a database
# process and listeners, and a project folder with .env files whose values are
# canaries that must never leave it. Nothing here runs a real web server or
# database. Built with `scripts/` as the context, to reuse the check
# harness's shims and recorded output.
ARG BASE=ubuntu:24.04
FROM ${BASE}
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssh-server \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /run/sshd \
    && useradd --create-home --uid 1500 --shell /bin/sh daminus \
    && usermod -p '*' daminus
# The shims sit on the PATH sshd gives a non-interactive session.
COPY check-harness/bin/ /usr/local/bin/
COPY check-harness/out/ /opt/daminus-harness/out/
COPY fake-server/nginx/ /etc/nginx/
COPY --chown=daminus:daminus check-harness/home/ /home/daminus/
RUN chmod 0755 /usr/local/bin/docker /usr/local/bin/pm2 /usr/local/bin/mysql /usr/local/bin/psql /usr/local/bin/dmesg \
    && chmod -R a+rX /opt/daminus-harness /etc/nginx \
    && mkdir -p /etc/nginx/sites-enabled \
    && ln -s /etc/nginx/sites-available/shop /etc/nginx/sites-enabled/shop \
    && ln -s ../sites-available/blog /etc/nginx/sites-enabled/blog \
    && mv /home/daminus/app/env.canary /home/daminus/app/.env \
    && mv /home/daminus/app/env-pg.canary /home/daminus/app/.env.pg \
    && mv /home/daminus/app/env-billing.canary /home/daminus/app/.env.billing \
    && chmod 0600 /home/daminus/app/.env /home/daminus/app/.env.pg /home/daminus/app/.env.billing \
    && mkdir -p /home/daminus/app/public /home/daminus/app/storage/logs /home/daminus/app/worker \
         /home/daminus/clean/public /home/daminus/.pm2 \
    && echo '<?php echo "shop";' >/home/daminus/app/public/index.php \
    && echo '<html></html>' >/home/daminus/clean/index.html \
    && chown -R daminus:daminus /home/daminus
# sshd: keys only, no PAM, one user.
RUN printf '%s\n' 'PasswordAuthentication no' 'KbdInteractiveAuthentication no' 'UsePAM no' \
        'PubkeyAuthentication yes' 'AllowUsers daminus' 'PrintMotd no' >/etc/ssh/sshd_config.d/daminus.conf
COPY fake-server/entrypoint.sh /entrypoint.sh
COPY fake-server/processes.sh fake-server/listen.pl /opt/fake-server/
RUN chmod 0755 /entrypoint.sh && chmod -R a+rX /opt/fake-server
# Secrets in the process environment, like a server's shell profile.
ENV CANARY_ENV_TOKEN=CANARY_process_env_7f3a \
    DB_PASSWORD=CANARY_process_db_password_91c2
EXPOSE 22
ENTRYPOINT ["/entrypoint.sh"]
