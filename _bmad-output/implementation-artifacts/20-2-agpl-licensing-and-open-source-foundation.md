---
title: 'Story 20.2: AGPL-3.0 Licensing & Open-Source Foundation'
type: 'feature'
created: '2026-10-26'
status: 'review'
baseline_commit: '0f760c6'
review_loop_iteration: 0
context:
  - '_bmad-output/implementation-artifacts/epic-20-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:**
Flashcard Master was originally initialized with `"private": true` and had no root `LICENSE` file. To open the project for community collaboration, public distribution, and desktop packaging, it requires an official open-source license. Without copyleft protection, third parties or commercial entities could take the entire codebase, host it as a proprietary, closed-source cloud SaaS, and monetize it without contributing their improvements back.

**Approach:**
1. **Root `LICENSE` File**:
   - Add the official, full text of the GNU Affero General Public License version 3 (AGPL-3.0).
   - Author copyright attributed to `2026 Ionut-Alexandru Prodan (alexprodan99) and Flashcard Master contributors`.
2. **Package Metadata (`package.json`)**:
   - Update root `package.json` with `"license": "AGPL-3.0"`.
3. **README Documentation & Badges**:
   - Add the official AGPL-3.0 shields.io badge (`[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL_3.0-blue.svg)](LICENSE)`).
   - Add a dedicated **📜 License** section explaining that the software is 100% free for individual learning, research, and local desktop use, while requiring any network/SaaS deployments to share source code modifications.
   - Note that sponsorship channels (`.github/FUNDING.yml`) are deferred until active funding accounts are created.

## Boundaries & Constraints

**Always:**
- Use the standard, unmodified GNU AGPL-3.0 license text.
- Retain complete local-first freedom for desktop, CLI, and self-hosted users.
- Ensure package manifests and build commands remain 100% intact.

**Never:**
- Never create broken/placeholder `.github/FUNDING.yml` files pointing to unconfigured donation accounts.
- Never alter the monorepo package workspace dependencies or breaking scripts.

## Acceptance Criteria

1. Root `LICENSE` exists containing the complete official GNU Affero General Public License v3 text.
2. Root `package.json` specifies `"license": "AGPL-3.0"`.
3. `README.md` includes the official license badge, copyleft summary, and open-source contribution foundation statement.
4. Monorepo builds, typechecks, and passes all tests (`npm test`, `npm run typecheck`, `npm run build`).
</frozen-after-approval>

## Implementation Record

### Completed Deliverables
- **Root `LICENSE`**: Created with the official GNU Affero General Public License version 3 (AGPL-3.0) and copyright notice attributed to `2026 Ionut-Alexandru Prodan (alexprodan99) and Flashcard Master contributors`.
- **Package Manifests**: Configured `"license": "AGPL-3.0"` in root `package.json` and synchronized across all packages (`@flashcard-master/core`, `@flashcard-master/adapters`, `@flashcard-master/cli`, `@flashcard-master/web`) and `package-lock.json`.
- **README Badges & License Section**: Added AGPL-3.0, TypeScript, and Node.js badges to the project header, and updated the License section with an explanation of personal freedom, copyleft reciprocity (Section 13), and anti-proprietary cloud enclosure protections.
- **Verification**: Verified zero regressions across 672 vitest tests, strict TypeScript typechecking (`tsc --noEmit`), and full monorepo build (`npm run build`).

