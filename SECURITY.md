# Security Policy

## Supported Versions

We actively maintain and provide security updates for the following versions:

| Version  | Supported          |
| -------- | ------------------ |
| Latest   | :white_check_mark: |
| < Latest | :x:                |

## Reporting a Vulnerability

We take security vulnerabilities seriously. If you discover a security
vulnerability in Aethel, please report it responsibly.

### How to Report

1. **Do NOT** create a public GitHub issue for security vulnerabilities
2. Send an email to the project maintainers with:
   - A clear description of the vulnerability
   - Steps to reproduce the issue
   - Potential impact assessment
   - Any suggested fixes (if available)

### What to Expect

- **Acknowledgment**: We will acknowledge receipt of your report within 48 hours
- **Initial Assessment**: We will provide an initial assessment within 5
  business days
- **Updates**: We will keep you informed of our progress throughout the
  investigation
- **Resolution**: We aim to resolve critical vulnerabilities within 30 days

### Responsible Disclosure

We follow responsible disclosure practices:

- We will work with you to understand and resolve the issue
- We will credit you for the discovery (unless you prefer to remain anonymous)
- We ask that you do not publicly disclose the vulnerability until we have had a
  chance to address it

## Security Measures

### Current Security Implementations

- **SSRF Protection**: API endpoints are restricted to whitelisted hosts to
  prevent Server-Side Request Forgery attacks
- **Input Validation**: All user inputs are validated and sanitized
- **Encryption**: Sensitive data like API keys are encrypted before storage
- **Authentication**: Secure token-based authentication for API access
- **Rate Limiting**: Protection against abuse and DoS attacks

### Allowed API Hosts

For security reasons, custom API endpoints are restricted to the following
trusted hosts:

- `api.openai.com`
- `openrouter.ai`
- `generativelanguage.googleapis.com`

### Security Best Practices

When contributing to or using Aethel:

1. **Never commit secrets**: Do not include API keys, passwords, or other
   sensitive information in code
2. **Use environment variables**: Store sensitive configuration in environment
   variables
3. **Validate inputs**: Always validate and sanitize user inputs
4. **Follow least privilege**: Grant minimal necessary permissions
5. **Keep dependencies updated**: Regularly update dependencies to patch known
   vulnerabilities

## Security Audits

We regularly review our codebase for security vulnerabilities and welcome
security audits from the community.

### Automated Security Checks

- **Dependabot**: Automatically monitors and updates vulnerable dependencies
- **CodeQL**: Static analysis for security vulnerabilities
- **ESLint Security Rules**: Linting rules to catch common security issues

## Contact

For security-related questions or concerns, please contact the project
maintainers at scan@scanash.com

---

**Note**: This security policy is subject to change. Please check back regularly
for updates.
