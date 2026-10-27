# Security Policy

The Flashcard Master team takes the security and privacy of our users, self-hosters, and their learning data very seriously. Because Flashcard Master is a local-first application processing potentially sensitive private notes and documents, we are committed to maintaining a secure, privacy-preserving architecture.

---

## Supported Versions

We provide active security patches and vulnerability updates for the following versions:

| Version | Supported | Notes |
| :--- | :--- | :--- |
| **1.x** | ✅ Yes | Current active release line |
| **< 1.0** | ❌ No | Pre-release experimental versions |

---

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues, discussions, or social media.**

### 1. Primary Reporting Method (Preferred)
Submit a confidential vulnerability report directly via **GitHub Private Vulnerability Reporting**:
👉 [**Report a Vulnerability on GitHub**](https://github.com/alexprodan99/flashcard-master/security/advisories/new)

This creates a private, encrypted advisory workspace where maintainers and researchers can collaborate on triage, reproduce the issue, and prepare a patch before coordinated disclosure.

### 2. Alternative Contact
If you are unable to use GitHub Advisories, you may email our security contacts:
📧 `security@flashcard-master.org`

### What to Include in Your Report
To help us investigate and resolve the issue quickly, please include:
- **Type of Issue:** (e.g., Server-Side Request Forgery (SSRF) in web ingestion, path traversal in local file picker, SQLite injection, unauthorized credential exposure, cross-site scripting (XSS)).
- **Affected Packages:** (e.g., `@flashcard-master/core`, `@flashcard-master/adapters`, `@flashcard-master/web`, `@flashcard-master/cli`).
- **Step-by-Step Reproduction:** A minimal proof of concept (PoC) or step-by-step instructions.
- **Impact Assessment:** What an attacker could achieve (e.g. read arbitrary local files, extract API keys, corrupt local SQLite database).
- **Environment Details:** Node.js version, OS, browser, and relevant configuration.

---

## Response Timeline & Disclosure Policy

When you submit a vulnerability report:
1. **Acknowledgment:** We will acknowledge receipt of your report within **48 hours**.
2. **Assessment & Triage:** We will validate and assess the vulnerability severity within **5 business days**, keeping you informed of our findings.
3. **Patch & Release:** We will develop a fix in a private branch, prepare a release, and coordinate public disclosure with credit to the reporter.
4. **Coordinated Disclosure:** We kindly request that you refrain from publicly disclosing the issue until a fix has been released.

---

## Core Security Invariants

When contributing or auditing code in Flashcard Master, uphold these non-negotiable security invariants:

1. **Local-First Privacy:** No user documents, flashcards, or telemetry are ever transmitted to third-party tracking servers.
2. **Strict Credential Isolation:** User API keys (OpenAI, Gemini, Claude, Notion) reside solely in the local SQLite settings table and are never logged or exposed to the client in plain text.
3. **Parameterized SQL:** All database interactions must use parameterized queries via `better-sqlite3`. String concatenation for queries is strictly prohibited.
4. **Input Sanitization:** Remote web articles, Notion content, and EPUBs are processed through clean markdown/text extractors. Untrusted HTML is never executed as raw scripts in the client.
