# Prisma migration baseline

`20261010000000_sbs_baseline` was generated from the repository's original SBS
Prisma schema. It represents the schema before ERP foundation changes.

## Fresh database

Create the database, configure `DATABASE_URL`, then run:

```sh
npm run prisma:deploy
```

## Existing SBS database

Do not deploy the baseline to an existing database: it creates the tables that
already exist. First make sure the database is reachable and compare it with the
original SBS schema from the initial repository commit. Do not compare the old
database with the current `schema.prisma`, because it now includes the Fase 0.1
changes:

```sh
git show b68cc47:server/prisma/schema.prisma > prisma/schema.sbs-baseline.prisma
npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.sbs-baseline.prisma --exit-code
npx prisma migrate resolve --applied 20261010000000_sbs_baseline
npx prisma migrate deploy
```

If the comparison reports drift, inspect and resolve that drift before marking
the baseline applied. Never use `migrate resolve` as a substitute for checking
the actual schema.

Mark the baseline applied before deploying
`20261010000100_integrity_constraints` to an existing SBS database. A fresh
database should simply run `migrate deploy`, which applies both migrations.
The integrity migration first checks for orphaned or cross-tenant references
and aborts with a specific error if found; it does not silently null historical
IDs.

The local development database was unavailable when this baseline was generated,
so no migration was applied and no database contents were modified.
