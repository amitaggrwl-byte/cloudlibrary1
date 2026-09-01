# CloudLibrary launch setup

## What this release protects

- Public reader profiles contain only shelf name, display name, avatar, bio,
  book count, and a server-calculated reader score. They never contain email.
- Full book records are readable only by the owner, current borrower, and
  accepted friends. `bookDiscovery` exposes only compact search-card data.
- Search is limited to 10 network results after friends' shelves are checked.
- Covers are stored under `covers/<uid>/<bookId>.jpg` in Firebase Storage.
- Firebase Functions is the sole authority for accepting/removing friends,
  lending, returns, lost books, account deletion, and reader-score changes.

## One-time local setup

Run these commands in this folder after the code review is complete:

```bash
npm install --global firebase-tools
firebase login
firebase use cloudlibrary-7b9ac
cd functions && npm install && cd ..
```

`firebase login` opens a browser sign-in page. Never put a password,
service-account file, or email-provider credential in this repository.

## Emulator check before production

```bash
firebase emulators:start
```

Use the Emulator UI at `http://127.0.0.1:4000` to verify that direct Firestore
writes cannot approve a loan or modify a reader score. The app itself still
uses the production configuration, so use the UI/rules test rather than
signing in through the normal page during this check.

## Production Firebase deployment

Deploy Firebase separately from Netlify. This does not publish the website:

```bash
firebase deploy --only firestore:rules,firestore:indexes,storage,functions
```

Wait for the declared Firestore indexes to finish building before running the
friend-request and borrow-request checks. The deploy creates the required
friendship and request indexes automatically.

## Netlify preview checklist

Before spending a production deploy credit, open a Netlify Deploy Preview and
test with two parent-owned Google accounts:

1. Create two shelves with safe bios and cover photos.
2. Send and accept a friend request; confirm both existing shelves open.
3. Request the same book from two accounts; approve one and confirm the other
   cannot be approved.
4. Confirm the borrower cannot hold more than three active loans.
5. Return once before 48 hours, once after 48 hours, and once late; check the
   reader score changes only in the expected cases.
6. Confirm a non-friend sees only the profile/discovery card, never email,
   notes, ISBN, cover upload path, or full shelf.
7. Search a title and confirm friends come first and network results stop at
   ten.
8. Verify camera/gallery cover upload, small and large screen navigation,
   sign-out on closing the session, and the 30-minute inactivity logout.
9. Remove a test friendship and confirm neither person can open the former
   friend's shelf. Test account deletion only on a disposable test account.

## Cost controls

The Functions in `functions/index.js` run in `asia-south1`, use 256 MiB,
have no warm instances, and cap at two simultaneous instances. Keep a modest
monthly Google Cloud budget alert enabled. Budgets alert; they do not stop
usage, which is why the query limits, rules, and concurrency cap are all part
of this release.
