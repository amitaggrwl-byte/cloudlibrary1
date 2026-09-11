# CloudLibrary audit - 7 September 2026

This is a working audit, not a launch approval. No production deployment has been performed.

## Verified fixes

- Firestore rules previously accepted an extra `userId` on a pending friendship, which the update rule treated as authorization. Reject extra fields, require the canonical friendship ID, and prohibit browser approval. Regression test failed before the change and passes afterwards; normal creation/cancellation also tested.
- Direct profile deletion could bypass the trusted account-cleanup flow. Browser profile deletion is now denied; the authenticated backend remains responsible for cleanup and active-loan checks.
- Loan participants could directly delete shared request history. Browser deletion is now denied. Existing reminder status actions remain permitted.
- Borrow request queries applied a limit before filtering out reminders. Eight reminders could conceal an existing duplicate request. Queries now filter by type before limiting; regression reproduced and fixed.
- Owned books, borrowed books, saved books and history listeners now have named lifecycle cleanup on sign-out/account changes. Borrowed-book reads select active loans only. Browser lifecycle testing is separate from rules testing.
- Mobile emulator warning covered navigation. Demo-only navigation now sits above the warning; this does not alter production navigation.

## Test coverage added

- Rules suite: 19 tests, including the three security regressions.
- Callable emulator suites: admin pagination/access and maintenance; concurrent loan approvals; return handshake; positive and lost-book ledger records; repeated borrowing; three-book cap; deletion blockers; duplicate requests with unrelated activity.
- `scripts/audit-ui.cjs`: local-demo browser smoke checks for Library, Add, Friends, Search, Inbox, Profile, Admin and Help at 1280x900, 390x844, 320x640 and 844x390. Captures screenshots and checks page overflow, form controls, help dialog and sign-out.
- This is not yet complete workflow coverage: camera hardware, successful account deletion, Storage uploads, offline recovery and production indexes require additional tests.
- Current results: 19 rules tests and 11 callable emulator tests passed. The browser smoke run passed 28 page/viewport combinations plus Help and sign-out at all four sizes, with no uncaught page errors. These checks are not a full functional or aesthetic sign-off.
- Visual inspection of the smallest Add form still shows cramped ISBN/cover input space; no-overflow checks alone do not establish usability. Admin feedback is bounded but remains visually long at ten expanded reply forms.

## Open findings requiring work before launch approval

### Data integrity and authorization

- Book rules constrain ownership/state but do not sufficiently validate metadata types, lengths or numeric ranges. Frontend year validation is not a security boundary.
- Shelf-name reservation does not prove that shelfKey equals normalized libraryName. Add adversarial normalization tests before tightening the schema.
- Account deletion is multi-step rather than resumable/locked. A concurrent approval or interrupted cleanup needs deliberate handling.
- Trigger counters use increments without event deduplication. Retried deliveries may distort totals. Book discovery updates can arrive out of order; deletion/update races need tests.
- Recounting book totals concurrently with score changes can overwrite newer score calculations. Design a transaction or reconciliation path.
- Return scoring now uses the borrower return-request time, so a delayed owner confirmation does not create a late penalty. Keep this covered when the return workflow changes.

### Growth and cost

- Own/friend shelves stop at 150 books without pagination, while bulk entry permits 200. Lent-out panels and displayed counts derive from that subset.
- Inbox retrieves bounded, unordered source sets and paginates those arrays locally. It does not yet provide full server-side history pagination.
- Borrowing history limits mixed requests to five before filtering borrow records; older history can disappear. Ledger stops at 20; saved books at 50; circle selection at 50. Add explicit cursor navigation and relevant-type filters.
- Friend-first search only includes the first 30 friend IDs. Search spelling tolerance depends on the initial database candidate query; fuzzy matching cannot recover a candidate never fetched.
- Each book-created event recounts its owner's books and can fan out ticker writes. Large imports require coalescing/reconciliation rather than merely increasing limits.
- maxInstances is per function, not a project spending cap. Existing code contains no hard total-billing guarantee or effective abuse quotas for all user writes.
- Cover upload followed by failed save can leave orphan files. Book deletion does not remove the cover file. Cleanup must avoid deleting a reused/shared image.

### Frontend and maintainability

- The entry form is rearranged after rendering. The previous detached-control bug demonstrates why final markup should have one owner rather than multiple scripts moving controls.
- CSS has accumulated override layers. Consolidate by component after capturing visual baselines; do not redesign while doing security fixes.
- Add/edit/bulk validation and metadata mapping differ. Extract shared pure validation with unit tests, then apply to frontend and trusted writes.
- Help imports existing HTML and also adds structured topics. Consolidate content into one source; check links/labels against actual controls.
- `Reading` is exposed as `Not for lending` in forms but not everywhere else. Decide whether these are distinct states and keep wording consistent.
- Audit remaining async callbacks, shared draft storage and cached UI on account switching. Listener teardown alone does not cover every pending request.
- Login failures lack a handled promise path. Account-deletion UI overrides all errors with an active-loan explanation, hiding network/permission failures.

## Next review batches

1. Finish visual and account-switch verification; preserve screenshots and report actual failures.
2. Shared metadata validation and add/edit/save/upload tests, including retries and invalid data.
3. Cursor pagination for shelves, history, inbox and saved books, with active-loan summaries independent of shelf pages.
4. Idempotent event processing, account-deletion recovery and bounded background work.
5. Consolidate frontend markup/styles only after behavioral coverage is in place.
6. Add an administrator-only **Borrowing policy** panel for safely changing the global active-loan limit, pending-request limit, same-title request limit and default loan period. Include validated ranges, sensible defaults, confirmation before saving, and an audit record of who changed each setting and when. Consider per-circle overrides only after the global policy has been used and reviewed.
7. Add a disputed damaged-return workflow before introducing a damage score penalty. Require evidence, notify both readers, and let an administrator resolve the case; never let either loan participant deduct points unilaterally.

No claim is made that all features, browsers or physical devices have passed. Emulator tests do not validate production IAM, index readiness, real Google sign-in, or camera hardware.
