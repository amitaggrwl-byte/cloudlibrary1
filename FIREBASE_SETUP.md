# CloudLibrary Firebase setup

## Publish the Firestore rules

Netlify only publishes the website. Open Firebase Console for project
`cloudlibrary-7b9ac`, go to Firestore Database > Rules, paste the contents of
`firestore.rules`, and publish. The lending limits, wishlist notifications, and
rating events require these rules.

## Turn on email notifications

Install Firebase's **Trigger Email** extension from Firebase Console >
Extensions. During setup, choose a `mail` collection and configure an email
provider such as SendGrid. This static app does not write mail documents yet,
so add a small Cloud Function that copies new pending borrow requests to that
collection. Keep provider credentials in Firebase/Google Cloud secrets, never
in `index.html`.

The function should react only to `requests` documents where:

- `type` is `borrow`
- `status` is `pending`

It should add a document to `mail` with `to` set to the book owner's email and
an HTML message linking to `https://cloudlibrary1.netlify.app/`.

This must be deployed from a trusted Firebase environment because sending email
requires provider credentials and a server-side function.

## Production note

Book cover photos are currently compressed and stored directly in Firestore to
make camera capture work without another service. For a larger library, move
these files to Firebase Storage and save only their URLs in the `books`
collection; Firestore documents have a 1 MiB limit.
