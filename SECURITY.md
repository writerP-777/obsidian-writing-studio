# Security Policy

## Supported Versions

Security fixes are applied to the **latest release only**. Older versions are not patched.

| Version | Supported |
|---------|-----------|
| 2.1.x (latest) | ✅ Yes |
| < 2.1 | ❌ No |

Always update to the latest release before reporting a security issue.

---

## Scope

Obsidian Writing Studio is a desktop-only Obsidian plugin. Security concerns relevant to this project include:

- **WordPress credential handling** — application passwords stored in plugin settings
- **Pandoc/LaTeX integration** — commands executed during export
- **Google Fonts loading** — external network requests made by Typography Mode
- **File system access** — reading and writing vault files and exported manuscripts
- **REST API communication** — requests made to configured WordPress sites

Issues that are solely within Obsidian core, the operating system, or third-party tools (Pandoc, LaTeX, WordPress) should be reported to those respective projects.

---

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

To report a vulnerability privately:

1. Navigate to the **Security** tab of this repository.
2. Click **Report a vulnerability** to open a private advisory draft.
3. Provide as much detail as possible, including:
   - A clear description of the vulnerability
   - Steps to reproduce or a proof-of-concept
   - The potential impact and affected versions
   - Any suggested mitigations, if known

You will receive an acknowledgment within **72 hours**. If the vulnerability is confirmed, a fix will be prioritized and a patched release published. You will be credited in the release notes unless you prefer to remain anonymous.

---

## Disclosure Policy

This project follows **coordinated disclosure**. Please allow a reasonable period (typically 90 days) for a fix to be developed and released before publishing details of the vulnerability publicly.

---

## Security Best Practices for Users

- Store WordPress application passwords using Obsidian's built-in settings rather than in plain Markdown notes.
- Use application-specific passwords (not your WordPress account password) for the WordPress publishing feature.
- Keep Obsidian Writing Studio updated to the latest release.
- Only install the plugin from the official GitHub releases page or the Obsidian Community Plugins directory.
