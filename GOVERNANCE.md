# TypeBridge Project Governance

TypeBridge is an open-source project dedicated to vendor-neutral, zero-overhead schema compilation. We follow an open, meritocratic governance model aligned with foundation standards (e.g., CNCF and OpenJS Foundation).

## Contributor Ladder

We believe in empowering active community members. Anyone can climb the contributor ladder through consistent, high-quality engagement:

```
┌─────────────────┐
│   Maintainer    │ (Final release authority, security advisories, project roadmap)
└────────▲────────┘
         │
┌────────┴────────┐
│    Committer    │ (Write access, PR merge authority, RFC co-authorship)
└────────▲────────┘
         │
┌────────┴────────┐
│    Reviewer     │ (Code review, LGTM approval on language generators)
└────────▲────────┘
         │
┌────────┴────────┐
│   Contributor   │ (Authored merged PRs, documentation, bug reports)
└─────────────────┘
```

### 1. Contributor
* **Requirements**: Submit an accepted PR (code, test, documentation, or issue triage).
* **Privileges**: Listed in `CONTRIBUTORS.md` and recognized via the `@all-contributors` bot.

### 2. Reviewer
* **Requirements**: Actively review PRs for at least 6 weeks; demonstrated expertise in at least one language generator (TypeScript, Python, Rust, Go).
* **Privileges**: Assigned as default reviewer on language generator submodules; `LGTM` power.

### 3. Committer
* **Requirements**: Author of 5+ merged significant PRs; demonstrated stewardship of project health, CI stability, and code quality.
* **Privileges**: Git repository write access; authority to approve and merge PRs.

### 4. Maintainer (PMC)
* **Requirements**: Sustained commitment over 6+ months; active leadership in release engineering and community support. Nominated and approved by majority vote of existing maintainers.
* **Privileges**: Release publishing keys (npm/crates), governance votes, security response team.

## Decision Making & RFC Process

For major architectural changes (e.g., introducing a new Intermediate Representation node, breaking CLI flags), contributors submit an **RFC (Request for Comments)** via GitHub Discussions. Decisions are reached by lazy consensus with a minimum 7-day review period.
