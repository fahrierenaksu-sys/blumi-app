# Blumi Maestro flows

Phone-level checks for sign-in, onboarding, Discover, Shop, Wardrobe, Room editor and Chat -> MiniRoom.
Flows never use real phone numbers: they sign in through the local-QA deep link `blumi://qa-sign-in?slot=N`.

## One-time setup (owner's Mac)
1. `maestro --version` (2.x). Not part of the repo's npm scripts.
2. Server, in-memory and loopback only. Put in `.env.qa.local`:
   `NODE_ENV=development BLUMI_AUTH_REPOSITORY=memory BLUMI_QA_AUTH_ENABLED=1`
   `BLUMI_QA_PHONE_NUMBER=+12025550101,+12025550102 BLUMI_QA_OTP_CODE=135790` (one per line), then `npm run server:qa`.
3. Mobile dev build in the Simulator with `EXPO_PUBLIC_BLUMI_LOCAL_QA_AUTH=1`,
   `EXPO_PUBLIC_BLUMI_LOCAL_QA_PHONES=+12025550101,+12025550102`, `EXPO_PUBLIC_BLUMI_LOCAL_QA_CODE=135790`
   and the API URL pointing at 127.0.0.1. Slot 1 = girl, slot 2 = boy.

## Run (from this folder, so screenshots land in `out/`)
    cd e2e/maestro
    maestro test flows/01_login.yaml
    maestro test flows/                 # everything, in file order
Flows share one in-memory server: run them in order, and do not restart the server between 02 and 06.
`out/` is gitignored.

## Layout
- `flows/` numbered test flows; `subflows/` sign_in, onboarding, shop_buy, open_wardrobe.
- Selectors use real testIDs where they exist; otherwise localized text (English|Turkish regex).
- Missing testIDs are listed in the lane REPORT; do not guess them.
