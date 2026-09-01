# CloudLibrary launch checklist

## One-time Firebase setup

1. In Firebase Authentication, enable Google sign-in and add `cloudlibrary1.netlify.app` to Authorized domains.
2. In Firebase Storage, create the default bucket if it does not exist.
3. Set a Google Cloud Billing budget of INR 500 with alerts at 50%, 75%, 90%, and 100%. A budget alerts you; it is not a hard cap.
4. Use the Firebase CLI browser login on this Mac. Never place service-account files or provider secrets in this repository.

## Local verification

1. Install launch-check dependencies with `npm install` in the repository root and `npm install` in `functions`.
2. Run `npm run check`.
3. Run `npm run test:rules`. This starts local emulators and verifies public profile privacy, friend-only book reads, locked loan state, locked ratings, and the ten-result search limit.
4. Run a local static server and test two separate Google accounts in separate browser profiles.

## Firebase deployment

1. Deploy only Firebase services first: `firebase deploy --only firestore:rules,firestore:indexes,storage,functions`.
2. Verify a friend request, an accepted friendship, one book request, approval, return, late return, and lost-book action.
3. Check Firebase Console usage after the test. Functions should show zero minimum instances and no unexpected errors.

## Netlify preview, then production

1. Push the reviewed commit to a branch and inspect the Netlify Deploy Preview.
2. Confirm Google sign-in, Storage camera upload, friend shelf visibility, global search, and the responsive phone layout on the preview URL.
3. Merge or push to `main` only after that preview is accepted. This is the single production Netlify publish.

## Cost guardrails in this build

- Functions use `asia-south1`, 256 MiB, a 30-second timeout, zero minimum instances, and a maximum of two instances.
- Full book records are never scanned globally.
- Discovery queries are limited to ten results.
- Ticker uses friend shelves only.
- Camera images are compressed and capped at 350 KB before Storage upload.
