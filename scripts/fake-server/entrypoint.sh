#!/bin/sh
# Starts the fake server: the key it trusts (AUTHORIZED_KEY), the host keys,
# the processes of the ssh user, then sshd in the foreground.
set -eu

: "${AUTHORIZED_KEY:?the public key sshd should accept}"
ssh-keygen -A >/dev/null
install -d -m 700 -o daminus -g daminus /home/daminus/.ssh
printf '%s\n' "$AUTHORIZED_KEY" >/home/daminus/.ssh/authorized_keys
chown daminus:daminus /home/daminus/.ssh/authorized_keys
chmod 600 /home/daminus/.ssh/authorized_keys

runuser -u daminus -- sh /opt/fake-server/processes.sh

exec /usr/sbin/sshd -D -e
