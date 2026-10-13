import { describeBetaResetError, runBetaResetCli } from "../src/operations/betaResetCli"

// Owner-approved full beta reset. Dry run by default; see src/operations/betaResetCli.ts and
// docs/release/DATABASE_RELEASE_RUNBOOK.md before running it against any real database.
void runBetaResetCli(process.argv.slice(2), process.env, (line) => process.stdout.write(`${line}\n`))
  .catch((error: unknown) => {
    process.stderr.write(`${describeBetaResetError(error)}\n`)
    process.exitCode = 1
  })
