# Blumi Mobile

Expo SDK 57 mobile app (React Native 0.86), the `@blumi/mobile` workspace package of the Blumi monorepo. It is not a standalone project: install from the repository root.

## Setup

```bash
npm ci   # at the repository root
```

## Run

From the repository root:

```bash
npm run dev:mobile                       # Metro (dev client, demo media mode)
npm --workspace @blumi/mobile run start  # equivalent
npm --workspace @blumi/mobile run ios    # build and run on the iOS Simulator
```

## Notes

- Expo SDK: `57`
- React Native: `0.86`
- Local iOS bundle id: `com.blumi.mobile`
- Home Studio QA module routing is handled through [metro.config.js](./metro.config.js)
