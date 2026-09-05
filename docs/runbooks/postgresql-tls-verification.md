# PostgreSQL TLS certificate verification

This runbook records the iRexPro database transport-security contract introduced in Sprint 49.

## Application contract

`DB_SSL=false` keeps TypeORM PostgreSQL TLS disabled. This is suitable for the verified same-host topology when PostgreSQL is bound only to loopback and the application does not cross an untrusted network.

`DB_SSL=true` enables TLS **and requires server-certificate verification**. The API deliberately does not provide an environment switch that maps database TLS to `rejectUnauthorized: false`.

Do not weaken this policy to work around certificate errors.

## Remote database deployments

When the API connects to PostgreSQL across another host or network:

1. Configure PostgreSQL with a certificate whose hostname/SAN matches the database hostname used by `DB_HOST`.
2. Use a certificate chain trusted by the Node.js runtime, or install the approved private CA into the runtime trust store using the deployment platform's normal certificate-management mechanism.
3. Set `DB_SSL=true` only after the certificate chain and hostname are correct.
4. Keep PostgreSQL off the public Internet; use the private network/firewall topology defined in the production deployment runbook.
5. Restart the API and verify `/api/v1/health/ready` returns HTTP 2xx.

A certificate-validation failure is a release/deployment hold. Do not fix it by disabling verification.

## Same-host deployments

For the current single-VPS topology, PostgreSQL may remain bound to `127.0.0.1` with `DB_SSL=false` when the API connects over loopback. If TLS is enabled even on the same host, the same certificate-verification contract applies.

## Troubleshooting boundaries

Database TLS failures must not cause credentials, DSNs, certificate contents, or database host details to be returned through public health endpoints or bootstrap error responses. Use approved server-side operational logs and PostgreSQL tooling for diagnosis.
