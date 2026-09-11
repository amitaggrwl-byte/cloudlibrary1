# CloudLibrary changelog

This file records notable product, UI, backend, data-rule, and test changes. Historical entries before 11 September 2026 were reconstructed from Git commit history; future entries must be updated as part of the same commit as the change.

## Unreleased

No completed changes recorded yet.

## 11 September 2026 — checkpoint `7900cc3`

### Added

- Added a chronological Reader score ledger showing the current score, current book contribution, return and loss adjustments newest-first, and the starting score.
- Added scoring support for a `+0.5` bonus on every fifth consecutive qualifying on-time return.
- Added an additional very-late penalty: returns more than 30 days overdue deduct `1.0` point instead of `0.5`.
- Added pure scoring tests and callable-emulator coverage for streaks, very-late returns, lost books, and delayed owner confirmation.
- Added reader and circle search maintenance tools for administrators.

### Changed

- Return scoring now uses the borrower’s return-request time, preventing a delayed owner confirmation from creating a late penalty.
- Borrowed books are ordered by the closest return date first, with undated loans last.
- Borrowing History now shows the relevant date for pending, approved, denied, cancelled, returned, and lost entries.
- Reader search now includes circle names and identifies the matching circle in results.
- Updated Help to explain ISBN entry, circle discovery, borrowing limits, returns, and the score rules.

### Fixed

- Restored the Reader score ledger’s missing `+1.5` book-listing contribution.
- Prevented an unbounded borrowed-book query from violating the Firestore list limit.
- Removed repeated or ambiguous labels in borrowing and lending sections.

### Verification

- Seven pure scoring tests passed.
- Sixteen Firebase callable/emulator tests passed after using the project’s Homebrew Java 21 runtime.
- The score ledger and dated borrowing-history records were inspected using the signed-in local UI.
- No production deployment was performed.

## 10 September 2026 — UI review batches

- Improved book and series cards, including tighter spacing, consistent action placement, compact lending details, cover handling, and horizontally scrollable Borrowed, Lent, and Saved sections.
- Highlighted overdue borrowed books in red and prevented raised card borders from clipping on hover.
- Removed repeated return dates from borrowed and lent cards and used three-letter month names.
- Refined Add and Edit Book forms with ISBN-first lookup, consolidated cover upload/URL handling, clearer field labels, compact year input, shelf status, and Lost status support.
- Refined reader and friend profiles with compact statistics, labelled member dates, full friend-shelf ribbons, clickable reader names, View my shelf, circle presentation, and reserved space for future achievement badges.
- Strengthened and repositioned permanent account-deletion warnings.
- Standardized navigation tabs, responsive labels, utility controls, icons, and medium-width behaviour.
- Improved Library attention cards, ticker presentation, saved-book availability notices, loan sorting, and action consistency.
- Commits: `f0b221f`, `449b64d`, `281f66f`, `94947fd`, `90a7e3d`, `f539ef6`, `bfe57f4`, `898324f`, `6d1f84e`, `40117c7`, `d38a8d7`.

## 8 September 2026

- Added scalable shelf and borrowing-history pagination.
- Commit: `eea481c`.

## 7 September 2026

- Improved book-entry and administrator workflows.
- Hardened Firestore rules and added audit-oriented regression tests.
- Commit: `e112438`.

## 3 September 2026

- Polished library discovery and lending flows.
- Hardened reader data and audit workflows.
- Fixed the narrow-phone account header.
- Commits: `b21acd6`, `591cc22`, `3b91355`.

## 2 September 2026

- Added the lightweight community ticker.
- Improved borrowing, series handling, reader tools, profile discovery, launch readiness, and scalable friendship handling.
- Commits: `9b51419`, `0a01508`, `e275f18`, `2bca736`.

## 1 September 2026

- Established the main lending workflows, navigation, discovery, reader profiles, inbox, friend shelves, reminder cleanup, and guarded book deletion.
- Added local Netlify metadata exclusions and compact search behaviour.
- Commits: `506aef0`, `2304aba`, `77c1cc8`, `6a865f6`, `bac0e07`, `e93a8aa`, `f9d3bbe`, `bb0ced9`, `1940610`, `baca68d`, `43eca55`.

## 31 August 2026

- Created the initial CloudLibrary application and early lending dashboard, inbox, and Firestore-rule foundation.
- Commits: `2950d6c`, `71a1c8c`, `07dae33`, `453d5f4`, `9070c1c`, `c522d6e`, `27a9809`.
