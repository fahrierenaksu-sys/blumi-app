@AGENTS.md

## Claude cloud container

These notes apply only when you run in the Linux cloud container, not on the owner's Mac.

- Node is v22.22.2 (`/opt/node22`), while `.nvmrc` asks for 22.23.3. npm only warns about the mismatch.
- `npm run verify:postgres` fails as root. Run only that gate as the non-root `pgtest` user:
  - The PostgreSQL 16 binaries are in `/usr/lib/postgresql/16/bin`, which is not on PATH.
  - `su` and `runuser` are blocked, so use a small Node launcher that calls `spawnSync` with `pgtest`'s `uid` and `gid` and adds that bin directory to PATH.
- Only PostgreSQL 16 tools are installed, and `pg_dump` 16 refuses the live 17.x server. The PostgreSQL 17 dump and restore proof before a schema change must run on the owner's Mac, unless you install pg 17 client tools first.
