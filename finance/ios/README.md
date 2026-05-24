# Ledger — iOS

SwiftUI app that talks to the same Next.js API. iOS 17+, Xcode 15+.

## What's here

- `FinanceApp/` — Swift sources, organised by feature.
- No Xcode project committed (binary). Create one once with:
  1. **Xcode → File → New → Project → iOS → App**
  2. Name `Ledger`, interface SwiftUI, language Swift, storage None.
  3. Delete the auto-generated `ContentView.swift` + `FinanceApp.swift` (sic) and drag this `FinanceApp/` group in.
  4. In **Signing & Capabilities** add **Sign in with Apple** *(later)* and **Associated Domains** for `applinks:` to your web origin if you want passkeys + universal links.
  5. Set deployment target to iOS 17.0.

## Configuration

Edit `API/APIClient.swift` and set `baseURL` to your deployed Ledger origin
(e.g. `https://ledger.example.com`).

For local development, run the web app and point the simulator at
`http://localhost:3000`. App Transport Security blocks plain HTTP by default —
add an exception in `Info.plist` for `localhost` while developing.

## Auth model

iOS uses the same Auth.js session as the web. The first launch sends a magic
link to your email; tapping the link in iOS Mail returns to the app (universal
link, if you wire `applinks:`), which then stores the session token in the
Keychain (`AuthManager`). Subsequent launches use Face ID to unlock that token.

## Features in this scaffold

- Login (magic link request)
- Dashboard (net worth, allocation, recent transactions) backed by `/api/dashboard`
- Statement upload from camera or photo library, followed by review
- Spending overview
- Pull-to-refresh, Swift Charts for the net-worth line

## Not in this scaffold (designed-for, easy to add)

- Passkey sign-in via `ASAuthorizationController`
- Offline cache (Core Data / SwiftData mirror of the last `/api/dashboard` response)
- Push notifications for new statement parsed
- Share-sheet target so you can hand any screenshot to Ledger
