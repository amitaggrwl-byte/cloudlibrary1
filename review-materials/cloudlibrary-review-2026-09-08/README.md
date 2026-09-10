# CloudLibrary visual review pack

This pack contains 56 screenshots captured from local commit `eea481c` using
Firebase emulator data. No production accounts or production records were used.

## Recommended review order

1. Start with `01-login` and the desktop overview images in each numbered folder.
2. Use the focused images to inspect expandable sections, modals, lists, and actions.
3. Finish with `10-responsive`, which shows the first visible screen at three real
   viewport sizes: 390 x 844, 320 x 640, and 844 x 390.

## Folder guide

### 01-login

- `desktop-login.png`: first visit on a wide screen.
- `phone-login.png`: first visit on a 390-pixel phone.

### 02-library

- `desktop-alex-library-full.png`: reader with a borrowed book and saved books.
- `desktop-bella-large-library-full.png`: owner with a 40-book series and active loan.
- `reader-profile-and-ticker.png`: profile summary and community ticker.
- `currently-borrowed.png`: borrower actions and due-date information.
- `currently-lent-out.png`: owner reminder and return state.
- `saved-books.png`: bookmarked reading list.
- `own-series-expanded.png`: series table on the owner's shelf.

### 03-add-books

- `desktop-add-page-full.png`: complete single-book workflow.
- `single-book-form.png`: the main form only.
- `bulk-and-series-entry.png`: list import and series helper.
- `quick-add-help.png`: brief contextual help shown without leaving the page.

### 04-friends

- `desktop-friends-list.png`: compact friends listing.
- `friend-profile-before-shelf.png`: profile information shown before opening a shelf.
- `bella-friend-shelf-full.png`: a populated friend's shelf with pagination.
- `friend-series-expanded.png`: expanded series with borrow and bookmark actions.

### 05-search

- `desktop-series-number-search.png`: series-title plus book-number search.
- `fuzzy-spelling-search.png`: a small spelling-error search.

### 06-inbox

- `desktop-inbox-all.png`: combined notifications and requests.
- `borrowing-filter.png`: borrowing-only filter state.

### 07-profile

- `desktop-profile-full.png`: profile, statistics, settings, and account controls.
- `score-ledger-expanded.png`: point history.
- `borrowing-history-expanded.png`: paginated borrowing history.
- `circle-manager.png`: joining and leaving approved circles.

### 08-admin

- `desktop-admin-overview.png`: health summary and first feedback page.
- `section-01-feedback.png`: feedback replies and pagination.
- `section-02-circles.png`: circle management.
- `section-03-community-administrators.png`: administrator configuration.
- `section-04-maintenance.png`: repair and maintenance tools.

### 09-help

- `help-overview.png`: Help layout and topic navigation.
- `help-search-isbn.png`: ISBN guidance.
- `help-search-borrow.png`: borrowing guidance.
- `help-search-return.png`: return guidance.
- `help-search-delete.png`: book and account deletion guidance.

### 10-responsive

Each of Library, Add, Friends, Search, Inbox, Profile, and Admin is captured at:

- `phone-portrait-*`: 390 x 844.
- `phone-small-*`: 320 x 640.
- `phone-landscape-*`: 844 x 390.

These are viewport screenshots rather than stitched pages, so fixed navigation is
shown in its real position and the reviewer sees what fits before scrolling.

## Test identities represented

- **AlexReads:** administrator, borrower, saved books, friends, and history.
- **BellaBooks:** large shelf, 40-book series, active lent-out copy, and circles.
- **CarlosCorner:** additional relationship and request data in the emulator.

## Not proven by screenshots

The pack does not validate the real Google sign-in popup, physical camera scanning,
live production permissions, slow/offline networks, email, or push notifications.
Those need interactive testing on real devices or the deployed environment.

`capture-results.json` lists every generated screenshot and any uncaught browser
errors. Its `errors` list was empty for this capture.

