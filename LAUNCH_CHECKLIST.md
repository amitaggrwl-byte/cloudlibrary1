# CloudLibrary launch checklist

## One-time Firebase setup

1. In Firebase Authentication, enable Google sign-in and add `cloudlibrary1.netlify.app` to Authorized domains.
2. In Firebase Storage, create the default bucket if it does not exist.
3. Set a Google Cloud Billing budget of INR 500 with alerts at 50%, 75%, 90%, and 100%. A budget alerts you; it is not a hard cap.
4. Use the Firebase CLI browser login on this Mac. Never place service-account files or provider secrets in this repository.
5. In Firestore, create `appConfig/community` with `adminUserIds` containing your Firebase Authentication UID and `circleLimit: 5`. Only those UIDs can run the one-time community-stat rebuild; `circleLimit` can be changed later without a code release.

## Establish the community-stat baseline

After deploying Functions and indexes, run the `rebuildCommunityStats` callable
once while signed in as a UID listed in `appConfig/community.adminUserIds`.
It uses Firestore aggregation counts for members, books, accepted friendships,
borrow/return history, active loans, and active circles, then writes one
`networkStats/current` document. It is a manual launch/maintenance action,
not a reader-facing feature, so ordinary page loads never scan the community.

## Establish approved circles

After creating `appConfig/community`, sign in with an `adminUserIds` account,
open **Reader profile → Manage circles**, and select **Add starter circles**.
It creates a small, editable catalog of HXLS, Grades 1-12, Gurgaon localities
and societies, reader genres, clubs, and fan groups. Readers can join and
leave only these approved tags; they cannot create circles themselves. Edit or
deactivate a circle in Firestore when the community changes. The membership
cap remains the `circleLimit` value in `appConfig/community`.

## Review feedback and community roles

The same `adminUserIds` list controls the small administrator view. An admin
can open **Reader profile -> Manage circles -> Review feedback and admin
roles** to see member feedback, mark it resolved, and see the configured
administrator profiles. Add or remove an administrator UID only in
`appConfig/community`; it is intentionally not a general reader setting.

## Borrowing limits and history

- Readers can hold up to three active loans.
- Readers can keep up to five unanswered book requests, and up to two for the
  same title.
- When a third loan is approved, other outstanding book requests are closed
  automatically with an explanation for the affected reader and owner.
- The home screen shows active loans. The separate **Borrowing history** view
  reads only the latest 20 history items; it does not grow the dashboard or
  load a reader's entire history.

## Local verification

1. Install launch-check dependencies with `npm install` in the repository root and `npm install` in `functions`.
2. Run `npm run check`.
3. Run `npm run test:rules`. This starts local emulators and verifies public profile privacy, friend-only book reads, locked loan state, locked ratings, and the ten-result search limit.
4. Run a local static server and test two separate Google accounts in separate browser profiles.

## Safe local demo

Use the local Firebase emulators before testing a release. The seeded accounts
are disposable and never connect to the live project.

1. In one terminal, run `npm run demo`.
2. In a second terminal, run `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 GCLOUD_PROJECT=cloudlibrary-7b9ac npm run demo:seed`.
3. Run the local web server, then open `http://localhost:8888/?demo=1`.
4. Choose Alex, Bella, or Carlos on the sign-in screen. The seed includes an
   accepted friendship, a pending friend request, shelves, a loan, and search
   cards so every logged-in view has meaningful content.

The seed script refuses to run unless both Firestore and Auth emulator
variables are present. It cannot write to production.

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
