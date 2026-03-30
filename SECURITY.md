# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.1.x   | ✅        |

## Reporting a Vulnerability

If you discover a security vulnerability in Selora, please report it responsibly.

**Do not open a public GitHub issue for security vulnerabilities.**

Instead, please email **[sidrat2612@gmail.com](mailto:sidrat2612@gmail.com)** with:

- A description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

You will receive an acknowledgment within **48 hours** and a detailed response within **5 business days**.

## Security Measures

Selora implements the following security practices:

- **Authentication** — Session-based auth with scrypt password hashing
- **RBAC** — 4-role access control (VIEWER, OPERATOR, ADMIN, TENANT_ADMIN)
- **CSRF protection** — Token-based CSRF prevention
- **Input validation** — Zod schemas on all API endpoints
- **SQL injection prevention** — Prisma ORM with parameterized queries
- **Secret encryption** — AES-256 encryption for stored secrets (GitHub tokens, API keys)
- **Audit trail** — Immutable event log for all sensitive operations
- **Rate limiting** — API endpoint rate limiting
- **CORS** — Configurable origin allowlist
- **Dependency scanning** — Regular `pnpm audit` in CI pipeline

## Responsible Disclosure

We ask that you:

- Allow reasonable time to address the issue before public disclosure
- Avoid accessing or modifying other users' data
- Act in good faith to avoid privacy violations and service disruptions

We will credit reporters in the release notes (unless you prefer to remain anonymous).
