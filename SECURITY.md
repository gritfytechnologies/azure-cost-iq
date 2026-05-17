# Security Policy

## Supported versions

| Version | Supported |
|---------|-----------|
| 2.x     | ✅ Yes    |
| 1.x     | ❌ No     |

## Reporting a vulnerability

Please **do not** open a public GitHub issue for security vulnerabilities.

Email: security@your-org.com (or use GitHub's private vulnerability reporting feature).

Include:
- Description of the issue
- Steps to reproduce
- Potential impact

We aim to acknowledge within 48 hours and resolve within 14 days.

## Security notes

- AzureCostIQ is a client-side SPA. No user data is stored or transmitted to any server other than the Azure Retail Prices API (a public Microsoft endpoint).
- The Express server (`server.js`) acts only as a CORS proxy for the pricing API — it does not log, store, or process any user input.
- When deployed privately (Terraform option), the App Service has `public_network_access_enabled = false` and requires Entra ID authentication.
- No cookies are set. No analytics. No tracking.
