# Binds every ADDRESS:PORT given on the command line, then sleeps: a listener
# that stands in for a server (the process name comes from how it is started).
use strict;
use warnings;
use Socket;

my @held;
for my $spec (@ARGV) {
	my ($addr, $port) = split /:/, $spec;
	socket(my $s, PF_INET, SOCK_STREAM, 0) or die "socket: $!";
	bind($s, sockaddr_in($port, inet_aton($addr))) or die "bind $spec: $!";
	listen($s, 5) or die "listen: $!";
	push @held, $s;
}
sleep 31536000;
