# CloudLibrary changelog

This document records the product, interface, backend, security-rule, test,
configuration, documentation, and deployment history of CloudLibrary.

Entries through 10 September 2026 were reconstructed from the Git history,
repository documents, and the behavior present at each checkpoint. Broad early
commits did not always contain detailed messages, so those entries describe only
changes supported by their diffs. From 11 September onward, every completed
change must update this file in the same commit.

## Unreleased

### Local work not yet released

- The working tree contains an unfinished global action-status/loading treatment.
  It is not recorded as a completed product change and must be reviewed and tested
  before it is committed.

## 12 September 2026

### Fixed

- Updated the Firestore rules test profile fixture with the current return-streak
  fields so profile-creation security tests exercise the production schema.

### Verification

- Revalidated syntax, book utilities, scoring, Firestore rules, and callable
  Functions before the GitHub and Firebase release.
- Passed all 21 Firestore security-rule tests and all 16 callable Function
  emulator tests before deployment.

### Deployment

- Published Firestore rules and indexes, Storage rules, and all 30 Cloud
  Functions to the `cloudlibrary-7b9ac` Firebase project.
- Published the verified `main` branch history to GitHub after the Firebase
  deployment completed successfully.

### Documentation

- Expanded the changelog from a high-level summary into a complete dated history.
- Added a full commit index so each historical change can be traced to Git.
- Separated source changes, verification evidence, production deployments, and
  known limitations to avoid treating documentation as proof of runtime behavior.

## 11 September 2026

### Reader scoring and history

- Added a chronological Reader score ledger with the current score, book-listing
  contribution, return/loss adjustments in newest-first order, and starting score.
- Restored the missing book-listing contribution: each listed book contributes
  `0.15`, capped at `1.5` points.
- Added `+0.5` for a qualifying on-time return and a bonus point on every fifth
  consecutive qualifying on-time return.
- Kept returns made within the first 48 hours neutral and recorded a `0.0` ledger
  event so the outcome remains explainable.
- Kept the ordinary late-return penalty at `-0.5`, added a `-1.0` penalty for a
  return more than 30 days overdue, and retained `-2.0` for a lost book.
- Made return scoring use the borrower's return-request timestamp. A delayed owner
  confirmation no longer turns a timely return into a late return.
- Ordered currently borrowed books by nearest due date, with undated loans last.
- Added meaningful dates for pending, approved, denied, cancelled, returned, and
  lost records in Borrowing History.
- Removed repeated and ambiguous borrowing/lending labels.

### Reader and circle search

- Added approved circle names to each reader profile's prefix-based search tokens.
- Updated circle join and leave transactions to rebuild the affected profile's
  search tokens immediately.
- Added circle names to reader-result filtering and displayed `Matched circle` when
  a circle caused the match.
- Added the administrator-only, cursor-paginated `rebuildProfileSearchIndex`
  callable, processing at most 100 profiles per request.
- Split Admin maintenance into **Rebuild book search**, **Rebuild reader search**,
  and **Recount totals**, with separate completion dates.
- Added a versioned Admin script URL so browsers do not retain the older
  one-button maintenance interface after an update.

### Interface and responsive refinements

- Removed the redundant profile shortcut from the main desktop navigation while
  preserving the signed-in account control and dedicated Profile destination.
- Kept desktop navigation icon widths stable and introduced compact labels at
  medium widths.
- Standardized active, hover, focus, and background treatments across navigation.
- Refined reader-profile spacing, statistics, member date, and action alignment.
- Highlighted overdue borrowed books and removed repeated return dates.
- Strengthened the account-deletion warning and separated it from routine profile
  actions.

### Help and administration

- Updated Help for ISBN lookup, circle discovery, borrowing limits, return
  handshakes, scoring rules, and maintenance behavior.
- Added changelog-maintenance rules to `AGENTS.md`.
- Replaced the original summary changelog with this traceable project history.

### Verification

- Seven pure scoring tests passed.
- Sixteen callable/emulator tests passed at checkpoint `7900cc3`.
- A later deployment gate passed 13 callable/emulator tests covering Admin,
  circle indexing, borrowing conflicts, return handshakes, repeated borrowing,
  loan limits, lost books, and reminder-query regressions.
- Reader score and dated borrowing-history output were inspected in the signed-in
  local interface.

### Firebase deployment

- Deployed `rebuildProfileSearchIndex` to `asia-south1` as a Node.js 22
  second-generation callable.
- Deployed updated `joinCircle` and `leaveCircle` callables so future membership
  changes keep reader search tokens synchronized.
- Verified all three Functions in the live Firebase Functions inventory.
- This targeted deployment did not publish the website, Firestore rules, indexes,
  Storage rules, or unrelated Functions.

### Commits

- `7900cc3` - Checkpoint CloudLibrary UI and scoring updates.
- `d730c5e` - Add and maintain project changelog.

## 10 September 2026

### Visual review and review materials

- Added a 56-image review pack covering login, Library, Add, Friends, Search,
  Inbox, Profile, Admin, Help, expanded sections, and responsive layouts.
- Captured desktop, 390 x 844 portrait, 320 x 640 small-phone, and 844 x 390
  landscape views using Firebase emulator data.
- Added reviewer guidance, a structured checklist, capture results, and the
  repeatable capture script.
- Kept production accounts and production records out of the screenshot pack.

### Login, branding, and navigation

- Refined the login page, brand treatment, account header, and responsive layout.
- Kept the signed-in reader identity, profile picture, Share, Help, and Sign Out
  accessible in the account area.
- Separated primary navigation from account utilities and added responsive compact
  labels without removing destinations.
- Standardized navigation styling and stabilized icon sizing.
- Fixed the narrow-screen header and reduced visual crowding at intermediate
  widths.

### Reader profile

- Consolidated the reader profile so the saved introduction is shown once and the
  editor appears only while editing.
- Added member date, books listed, books lent/lent out, timely returns, friend
  count, circles, reader score, and a reserved achievements area.
- Added clearer self-profile and other-reader variants.
- Moved profile editing, circle management, score ledger, borrowing history, and
  account deletion into the Profile experience.
- Made reader names and profile actions clearer before viewing a friend's shelf or
  accepting a friend request.

### Library and book cards

- Added dedicated, horizontally scrollable sections for currently borrowed,
  currently lent out, and saved books.
- Kept current transactions visible without letting historical borrowing dominate
  the dashboard.
- Refined individual-book and series-stack cards for consistent widths, spacing,
  cover treatment, actions, and lending status.
- Made expanded series use a compact table-style list instead of creating a long
  column of full book cards.
- Added wide-screen multi-column shelf layouts while preserving portrait and
  landscape behavior.
- Added overdue emphasis and clearer return/lending information.

### Adding and editing books

- Reworked Add and Edit around a single validated book-record shape.
- Placed ISBN lookup early in the flow and added metadata lookup for title, author,
  cover, year, genre, and available series details.
- Added cover-photo upload, secure cover URL support, replacement/removal, client-
  side compression, and file-size limits.
- Added cover-text reading and catalog matching as an optional on-device-assisted
  path when ISBN is unknown.
- Kept optional fields visible instead of hiding them behind a disclosure.
- Added the **Not for lending** state so a reader can catalogue a private copy
  without offering it for borrowing.
- Clarified required fields, field ordering, action buttons, contextual Help, and
  the distinction between preparing a series list and saving reviewed books.

### Search, saved books, and ticker

- Improved series-title and series-number search, including ordinal forms and
  small spelling errors.
- Ranked an exact requested series number ahead of alternative books in the same
  series.
- Added bounded cursor loading for additional search candidates.
- Replaced the original free-text wishlist with bookmark-style saved books from
  Search and friend shelves.
- Made saved books reopen a search for the correct book title rather than an
  unrelated series-only query.
- Tightened the Cloud ticker, improved labels and iconography, removed reader names
  from anonymous community book activity, and linked book titles back to Search.
- Added lightweight community totals and book suggestions without scanning full
  book records on every page load.

### Friends, inbox, feedback, and administration

- Made friend cards more compact and removed repeated biography/status copy.
- Added deliberate friend-removal confirmation and clearer sent-request states.
- Improved friend-profile and friend-shelf transitions so profile dialogs close
  when the shelf opens.
- Kept Inbox compact with filters, bounded loading, distinctive activity icons,
  and feedback replies.
- Split Admin into Community health, Feedback, Circles, Community administrators,
  and Maintenance sections.
- Added feedback reply/status handling, circle filters, pagination, refresh
  controls, and bounded Admin lists.

### Commits

- `f0b221f` - Improve CloudLibrary UI and book workflows.
- `449b64d` - Align profile action buttons.
- `281f66f` - Strengthen account deletion warnings.
- `94947fd` - Refine reader profile layout.
- `90a7e3d` - Standardize navigation tab styling.
- `f539ef6` - Simplify desktop navigation background.
- `bfe57f4` - Use compact labels at medium widths.
- `898324f` - Stabilize desktop navigation icons.
- `6d1f84e` - Remove repeated borrowed return dates.
- `40117c7` - Highlight overdue borrowed books.
- `d38a8d7` - Remove redundant profile shortcut.

## 8 September 2026

### Pagination and large-library behavior

- Replaced fixed own-shelf and friend-shelf snapshots with cursor pagination and
  explicit **Load more books** controls.
- Added cursor pagination to Borrowing History, querying borrow records before
  filtering so reminders cannot hide genuine history.
- Loaded active owner loans independently from shelf pages so a lent-out copy is
  not missed when it falls outside the currently visible shelf page.
- Preserved real-time behavior for active transactions and Inbox where immediacy
  matters instead of treating pagination as a universal replacement for listeners.
- Capped clean-launch bulk import at 100 reviewed books per operation.

### Validation, rules, and indexes

- Strengthened clean-launch book metadata validation and aligned Add, Edit, and
  bulk import with the same normalized record shape.
- Added and adjusted Firestore composite indexes required by paginated shelf,
  active-loan, and borrowing-history queries.
- Tightened Firestore query bounds and authorization for paginated reads.
- Updated emulator seed data for large shelves, series, active loans, and history.

### Verification

- Recorded 39 passing automated tests at checkpoint `eea481c`.
- Visually checked mobile layouts, large shelves, active-loan completeness,
  borrowing history, and cross-account access with emulator accounts.
- Explicitly retained camera hardware, production IAM/index readiness, and real
  Google sign-in as separate production/device checks.

### Commit

- `eea481c` - Add scalable shelf and history pagination.

## 7 September 2026

### Modular frontend tools

- Extracted reusable Admin dashboard, Help, book-form layout, book validation, and
  responsive styling into dedicated assets.
- Added ISBN parsing/validation, normalized catalog metadata, series-number search
  parsing, spelling-tolerant matching, and shared book validation tests.
- Added cover-photo text recognition and catalog candidate selection.
- Added structured, searchable Help with targeted topics and step-by-step guidance.

### Administration and feedback

- Added the dedicated Admin console with community health, feedback review/reply,
  circle management, administrator visibility, and maintenance controls.
- Added bounded Admin pagination and status/category filtering.
- Added administrator-only maintenance callables and access checks.

### Security and data-integrity fixes

- Rejected crafted friendship records containing extra authorization fields.
- Required canonical friendship IDs and prohibited direct browser approval.
- Blocked direct profile deletion so account cleanup and active-loan checks must go
  through the trusted backend.
- Prevented loan participants from deleting shared request history.
- Fixed duplicate-borrow detection so unrelated reminder records cannot hide an
  existing pending borrow request.
- Added named listener cleanup for owned books, borrowed books, saved books, and
  history during sign-out or account changes.
- Ensured borrowed-book reads select active loans only.

### Tests and audit documentation

- Added rules regression tests, callable emulator tests, pure book-tool tests, and
  browser smoke auditing.
- Added `PROJECT_AUDIT.md` with verified fixes, remaining risks, cost concerns, and
  staged follow-up work.
- Added seeded Admin and Search scenarios for repeatable local review.
- The audit recorded 19 rules tests, 11 callable emulator tests, and 28 page/
  viewport smoke combinations at that checkpoint.

### Commit

- `e112438` - Improve entry and admin workflows; harden rules with audit tests.

## 3 September 2026

### Brand and interface polish

- Added the CloudLibrary mark, wordmark, reverse wordmark, stacked lockup, brand
  usage notes, and a local brand preview.
- Integrated the brand into login and navigation surfaces.
- Polished library discovery, saved-book, ticker, friend, and lending interactions.
- Improved profile and shelf presentation without exposing email addresses.

### Backend and security

- Hardened reader-facing data and audit workflows.
- Refined backend bookkeeping and discovery updates.
- Added regression coverage for tightened public-profile behavior.

### Responsive fix

- Fixed the signed-in account header on narrow mobile screens.

### Commits

- `b21acd6` - Polish library discovery and lending flows.
- `591cc22` - Harden reader data and audit workflows.
- `3b91355` - Fix narrow mobile account header.

## 2 September 2026

### Community ticker and statistics

- Added a lightweight Cloud ticker with bounded community and friend activity.
- Added server-maintained compact discovery/activity records and required indexes.
- Added aggregate community totals and manual administrator recount support so
  ordinary page loads do not scan the whole database.
- Added cost guardrails: bounded reads, zero minimum instances, low memory, and a
  two-instance maximum for Functions.

### Friendships, borrowing, and account lifecycle

- Normalized friendship handling around canonical participant fields.
- Added trusted callable workflows for friend acceptance/removal, borrowing,
  returns, lost books, stale-notification cleanup, and account deletion.
- Enforced a maximum of three active borrowed books, five unanswered requests,
  and two simultaneous requests for the same title.
- Closed competing pending requests when a copy is lent and allowed a returned or
  denied book to be requested again.
- Prevented account deletion while the reader is lending or borrowing an active
  book; cleanup closes pending requests and notifies friends.

### Series, saved books, profiles, and circles

- Added bulk book entry and series helpers.
- Added expandable series grouping and series metadata.
- Added saved-book/wishlist-era discovery and availability notifications.
- Expanded reader profiles with biography, member date, score, books, lending,
  returns, friends, and community context.
- Introduced administrator-approved circles and starter community tags.
- Added feedback collection and administrator roles.

### Local development and launch readiness

- Added compiled Tailwind assets and project configuration.
- Added safe Firebase Emulator demo accounts and seeded books, friendships,
  requests, loans, and notifications.
- Expanded launch, deployment, budget-alert, privacy, and production-test guidance.
- Added Netlify security/configuration headers and local metadata exclusions.

### Commits

- `9b51419` - Add lightweight community ticker.
- `0a01508` - Improve launch readiness and scalable friendships.
- `e275f18` - Improve borrowing, series, and reader tools.
- `2bca736` - Refine profiles, discovery, and reader tools.

## 1 September 2026

### Firebase foundation

- Added Firebase project configuration, Firestore and Storage rules, indexes,
  Functions, local dependencies, rules tests, and setup documentation.
- Moved sensitive shared state changes to trusted callable Functions.
- Added launch and deployment checklists.

### Authentication and onboarding

- Added Google sign-in and session-based persistence.
- Added first-use shelf-name and reader-introduction onboarding.
- Added unique shelf-name reservations and public profile records without email.
- Added sign-out and account-deletion flows.

### Books and discovery

- Added book creation, editing, duplicate protection, deletion rules, cover upload,
  ISBN/year/genre/condition fields, notes, status, and star rating.
- Added global discovery through compact `bookDiscovery` records instead of public
  access to full book documents.
- Added search for books, authors, readers, and shelf names with friend priority.
- Added friend-shelf views and sharing links.

### Friendship and lending workflows

- Added sent/pending/accepted/denied friendship states.
- Added profile preview before accepting a friend request.
- Added borrow requests, approval/denial, due dates, owner reminders, returned and
  lost outcomes, repeat borrowing, and competing-request handling.
- Added persistent Inbox records and distinct notification states.
- Added reader score changes and protected score writes.

### Interface fixes and refinements

- Separated Add Book into its own destination.
- Moved the reader profile to the top of Library and later into a dedicated profile
  experience.
- Compacted Inbox and friend cards, improved friend-shelf context, and added profile
  statistics.
- Fixed compact Search layout, responsive navigation, stale reminders, and
  owner-book deletion permissions.
- Added clearer pending friend-request state, cancellation, rejection, and
  re-request behavior.
- Ignored local Netlify metadata and development lock files.

### Commits

- `506aef0` - Strengthen lending and add reader features.
- `2304aba` - Merge remote updates with lending features.
- `77c1cc8` - Improve library navigation and discovery.
- `6a865f6` - Launch-ready CloudLibrary lending workflows.
- `bac0e07` - Ignore local Netlify metadata.
- `e93a8aa` - Fix compact search layout.
- `f9d3bbe` - Ignore local Netlify dev lockfile.
- `bb0ced9` - Refine reader profile controls.
- `1940610` - Compact inbox and enrich reader profiles.
- `baca68d` - Refine friend shelves and reader profile.
- `43eca55` - Fix stale reminders and book deletion.

## 31 August 2026

### Initial application

- Created the original single-page CloudLibrary application and Netlify
  configuration.
- Established the visual direction, responsive page shell, book shelf, Add Book,
  Friends, Search, Inbox, and initial reader/account surfaces.
- Added the first lending dashboards and persistent Inbox behavior.
- Added initial Firestore security rules and iterated on profile, book,
  friendship, request, and rating access.
- Refined the early dashboard and activity/ticker experiments.

### Historical caution

- The early `Update ... via codex/gemini` and upload commits contain limited commit
  descriptions. Their exact rule and interface revisions remain traceable in Git,
  but this changelog does not claim unrecorded runtime verification for them.

### Commits

- `2950d6c` - Initial commit via Netlify.
- `71a1c8c` - Add initial Firestore rules.
- `07dae33` - Add lending dashboards and persistent Inbox.
- `453d5f4` - Update the original application interface.
- `9070c1c` - Revise Firestore rules.
- `c522d6e` - Further revise Firestore rules.
- `27a9809` - Integrate the revised dashboard, ticker, and rules state.

## Current verification boundaries

The repository contains meaningful automated and visual coverage, but the
following still require separate verification and are not implied by any
historical entry above:

- Real Google sign-in inside embedded browsers; Chrome, Safari, and Edge remain
  the supported path for real local authentication.
- Physical-device barcode scanning, camera permissions, and cover capture.
- Slow, offline, interrupted, and retry-heavy network conditions.
- Production IAM, CORS, index build completion, and quota/billing behavior after
  every deployment.
- Successful account deletion should be tested only with a disposable account.
- Email and push notifications are not implemented; reminders are in-app records.
- Trigger counters and multi-step account deletion still need stronger
  idempotency/recovery design before large-scale use.

## Future features recorded separately from completed work

These ideas have been discussed but must not be mistaken for shipped behavior:

- Circle administrators below the global administrator role.
- Administrator-configurable borrowing limits and loan durations.
- Achievement badges and reader-written reviews.
- A scalable dedicated reader-discovery index for large-community circle search;
  current circle search uses profile tokens as a low-cost launch bridge.
- Automatic scheduled, email, or push return reminders.
- Damage/dispute handling with evidence and administrator resolution.
