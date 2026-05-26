# Contributing to Obsidian Writing Studio

Thank you for your interest in contributing to Obsidian Writing Studio. This document outlines the process for reporting bugs, requesting features, and submitting code contributions.

---

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Before You Start](#before-you-start)
- [Reporting Bugs](#reporting-bugs)
- [Requesting Features](#requesting-features)
- [Development Setup](#development-setup)
- [Automated Tests](#automated-tests)
- [Submitting a Pull Request](#submitting-a-pull-request)
- [Coding Standards](#coding-standards)
- [Commit Messages](#commit-messages)

---

## Code of Conduct

This project follows a [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you agree to uphold it.

---

## Before You Start

Before opening an issue or submitting a pull request:

1. **Search existing issues** to ensure your bug or request has not already been filed.
2. **Check the README** — many behaviors are intentional and documented.
3. **Confirm you are on the latest release** before reporting a bug.

---

## Reporting Bugs

Use the **Bug Report** issue template when filing a bug. Please include:

- Your Obsidian version and Writing Studio version
- Your operating system (Windows / macOS / Linux) and version
- A clear, minimal description of the problem
- Steps to reproduce the issue reliably
- What you expected to happen vs. what actually happened
- Any relevant screenshots or console output (open the developer console with `Ctrl+Shift+I` / `Cmd+Option+I`)

The more detail you provide, the faster the issue can be triaged and resolved.

---

## Requesting Features

Use the **Feature Request** issue template. Please describe:

- The problem you are trying to solve or the workflow gap you are experiencing
- Your proposed solution or the behavior you would like to see
- Any alternatives you have considered

Feature requests are evaluated against the project's scope and roadmap. Not every request will be accepted, but all are read and considered.

---

## Development Setup

### Prerequisites

| Tool | Minimum version |
|------|----------------|
| Node.js | 18.x or later |
| npm | 9.x or later |
| Obsidian | 1.7.2 or later (desktop) |
| CodeQL CLI | latest (optional — enables local security scanning) |

Install the CodeQL CLI on Windows with:
```bash
winget install GitHub.CodeQL
```
Or download from the [CodeQL CLI releases page](https://github.com/github/codeql-cli-binaries/releases).

### Steps

```bash
# 1. Fork and clone the repository
git clone https://github.com/YOUR_USERNAME/obsidian-writing-studio.git
cd obsidian-writing-studio

# 2. Install dependencies
npm install

# 3. Build the plugin
npm run build

# 4. Copy output files to your test vault
#    <vault>/.obsidian/plugins/obsidian-writing-studio/
cp main.js manifest.json styles.css /path/to/your/test-vault/.obsidian/plugins/obsidian-writing-studio/
```

For active development with automatic rebuilds:

```bash
npm run dev
```

Enable the plugin in Obsidian under **Settings → Community Plugins**, then reload Obsidian after each build (`Ctrl+R` / `Cmd+R`).

### Git hooks

Two hooks run automatically after cloning:

- **Pre-commit** — runs `npm run lint` (ESLint). The commit is **blocked** if any warning or error is found. Fix all lint issues before committing.
- **Pre-push** — runs a full CodeQL scan. The push is **blocked** if any HIGH or CRITICAL severity finding is present. Results are written to `.codeql-results.sarif`. If the CodeQL CLI is not installed, the scan is skipped with a warning.

Run `npm run lint` manually at any time to check for issues before committing.

---

## Automated Tests

The project uses [Jest](https://jestjs.io/) with [ts-jest](https://kulshekhar.github.io/ts-jest/) for unit testing. Tests live in the `tests/` directory and are run automatically by CI on every push and pull request.

### Running the tests

```bash
npm test
```

### Test policy

**Any new functionality added to the plugin must include tests for that functionality.** This applies to pure business logic, utility functions, and any module that can be tested without the Obsidian runtime. Tests are not required for Obsidian UI components (views, modals, leaf management) that cannot run outside the Obsidian desktop context.

When adding a new feature:

1. Place test files in `tests/` next to a name that mirrors the module under test (e.g. `tests/myFeature.test.ts` for `src/MyFeature.ts`).
2. Focus on the public interface of each module. Test inputs and outputs, not internal implementation details.
3. Use the Obsidian mock in `tests/__mocks__/obsidian.ts` to stub Obsidian API classes when the module under test imports from `obsidian` but the methods being tested do not actually call the Obsidian API at runtime.
4. Run `npm test` before opening a pull request and confirm all tests pass.

Pull requests that add new functionality without accompanying tests will be asked to add tests before merge.

---

## Submitting a Pull Request

1. **Open an issue first** for any non-trivial change so the approach can be discussed before you invest significant time.
2. **Fork** the repository and create a branch from `main`:
   ```bash
   git checkout -b fix/short-description-of-change
   ```
3. **Make your changes**, following the coding standards below.
4. **Run the automated test suite** with `npm test` and fix any failures.
5. **Test in Obsidian** — verify the change works on at least one platform and does not break existing features.
6. **Commit** with a clear message (see Commit Messages below).
7. **Push** your branch and open a pull request against `main`.
8. Fill out the pull request template completely.

Pull requests that lack a description, skip testing, or include unrelated changes will be asked to revise before review.

---

## Coding Standards

- The project is written in **TypeScript**. All new code must be typed; avoid `any` except where strictly necessary.
- Follow the existing code style. An `.editorconfig` and `tsconfig.json` are included — respect them.
- Keep changes focused. One logical change per pull request.
- Do not commit build artifacts (`main.js`, `styles.css`) — they are generated by CI.
- Add comments for non-obvious logic.

---

## Commit Messages

Use the imperative mood and keep the subject line under 72 characters:

```
Fix sprint timer not resetting on second sprint
Add EPUB language setting to export modal
Refactor binder drag-and-drop for accessibility
```

Reference related issues where applicable:

```
Fix word count goal not persisting after vault reload (#42)
```

---

## Questions

If you have a question that is not covered here, open a **Discussion** on the GitHub repository rather than an issue.
