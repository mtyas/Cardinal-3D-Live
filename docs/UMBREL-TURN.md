# TURN on Umbrel: deployment checklist

Status: prepared network plan, **not deployed or enabled**. Router WAN address
and actual Docker listener reachability still need verification. This extends
the existing single-engine WebRTC path described in [WEBRTC-AUDIO.md](WEBRTC-AUDIO.md).

## Router prerequisites

Reserve a fixed LAN address (UMBREL-IP) for Umbrel in DHCP. Compare the router's WAN IPv4 address
with the home's public IPv4 address. A private or shared WAN address means there
is another NAT upstream; forwarding on this router alone is insufficient.
Check with the ISP before proceeding if the WAN address is in `10.0.0.0/8`,
`172.16.0.0/12`, `192.168.0.0/16`, or `100.64.0.0/10`.

For the proposed initial deployment, forward these ports to Umbrel. External
and internal port numbers must match:

| External ports | Protocol | Internal destination | Purpose |
| --- | --- | --- | --- |
| 3478 | UDP | UMBREL-IP:3478 | Preferred TURN connection |
| 3478 | TCP | UMBREL-IP:3478 | TURN connection fallback |
| 49160–49223 | UDP | UMBREL-IP, same range | Allocated media relay sockets |

No DMZ, UPnP, router administration forwarding, or additional HTTPS forwarding
is needed. TCP TURN can help where client UDP is blocked, but can incur
head-of-line delays. It is not TURN over TLS on port 443.

## Container preparation

Use the official, versioned `coturn/coturn:4.18.0-r0` image, resolving and recording
its registry digest during deployment. Its official multi-platform image
includes ARM64. Preserve upstream notices if redistributing the image.

Use a separate `cardinal-turn` container, a private configuration file, bounded
memory/CPU and rotated logs. Do not replace the welcome portal or existing apps.
Existing custom containers publish ports 8788 and 8088; their port listings do
not establish that the proposed ports are free in every Umbrel network namespace.
Portainer reports a containerized Docker daemon. Verify its host-network
namespace and the actual LAN listener before choosing host networking versus
explicit published ports. Do not assume its host interface is UMBREL-IP.

Required coturn configuration decisions:

- Enable `use-auth-secret` with a generated random secret held only in private
  operator files and the TURN container. Use the existing relay's one-hour HMAC
  credentials. Never enable anonymous allocations or place the secret in Git.
- Set a stable realm, `fingerprint`, `min-port=49160`, `max-port=49223`, explicit
  listening/relay IPv4 interfaces and the public/private `external-ip` mapping.
  Account for both Docker and router NAT when applicable.
- Disable CLI/web administration, multicast peers, loopback peers, TCP relay
  allocations, TLS and DTLS listeners for this initial plain TURN deployment.
  `no-tcp-relay` still permits a TCP client connection carrying UDP relay traffic.
  WebRTC media retains its own DTLS/SRTP encryption.
- Deny private, shared, link-local, reserved and multicast peer destinations;
  bind IPv4 explicitly. Do not broadly allow LAN peer destinations to fix a test.
  Validate public/reflexive peer connectivity instead.
- Bound allocation count, per-user allocations and total bandwidth. Choose limits
  for the current 16-listener cap and verify that retries do not exhaust them.
  TURN allocations are not equivalent to individual speaker tracks.
- Use no-new-privileges, drop unnecessary capabilities and keep configuration
  outside image layers/command-line arguments. Check server clock accuracy.

These are deployment requirements, not a ready-to-run configuration: public IP,
interfaces and Docker routing must be verified first.

## Application activation and acceptance

Back up `.tools/live-0.6/hosting.json` privately. Add the actual public TURN URL(s)
and matching secret to its `webrtc` object; do not edit the 0.5 configuration.
Use `turn:PUBLIC-IP:3478?transport=udp` and optionally TCP. Never point TURN at the
Cloudflare-proxied live address: the HTTP tunnel does not carry
these sockets. A separate DNS-only hostname is optional. A changing public IP
requires updating the advertised mapping as well as DNS and restarting coturn.

Before normal activation:

1. Verify authenticated allocations and rejection of invalid credentials locally.
2. Verify denied peer destinations and resource limits; inspect redacted logs.
3. Temporarily set `relay_only: true` in the private 0.6 hosting configuration,
   restart 0.6, and use only the public synthetic mixer fixture for automated
   public tests. Restore the prior setting after the test.
4. Test from a phone on **cellular data**, with Wi-Fi disabled, and a collaborator
   on a separate internet connection. Home-network hairpin NAT is not acceptance.
5. Require `WebRTC · TURN relay`, received/decoded audio, moving mixer meters,
   bounded packet loss/jitter over several minutes, and audible control response.
   Record actual action-to-sound delay; RTT and jitter-buffer delay alone are
   insufficient.
6. Test UDP and TCP URLs separately, reconnect, grant/revoke, and host shutdown.

Keep buffered audio as fallback. A TURN connection does not itself establish
glitch-free audio or acceptable musical latency. Rollback is restoring the private
0.6 configuration, restarting its relay, stopping `cardinal-turn`, and removing
the three router forwarding rules. Preserve 0.5 throughout.

References: [official Docker image documentation](https://github.com/coturn/coturn/blob/master/docker/coturn/README.md),
[coturn configuration](https://github.com/coturn/coturn/blob/4.18.0/examples/etc/turnserver.conf),
[versioned image release](https://github.com/coturn/coturn/releases/tag/docker/4.18.0-r0).
