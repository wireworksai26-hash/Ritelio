# NestJS domain module scaffold

Use this layout for each new ERP domain. Keep controller code limited to HTTP
binding and delegate business rules to services.

```text
<domain>/
  <domain>.module.ts
  <domain>.controller.ts
  <domain>.service.ts
  dto/
    create-<entity>.dto.ts
    update-<entity>.dto.ts
  <domain>.service.spec.ts
```

## Module boundary

- A module owns its controllers, services, DTOs, and domain-specific tests.
- Import other domain modules only through exported services; do not reach into
  another module's Prisma access or private helper.
- Use the global `PrismaService`; every read and write must include `tenantId`.
- Financial and inventory writes must be enclosed in a Prisma transaction.
- Financial postings go through `JournalService.post`; never write a report total
  or account balance directly.
- Tenant-owned resources that are company-scoped must also filter by `companyId`.

## Controller contract

- Declare `@RequirePermissions(...)` for every protected route.
- Obtain identity with `@CurrentUser()` and tenant with `@Tenant()`; never accept
  either identifier from a request body.
- Use class DTOs for query parameters and bodies so the global validation pipe
  can transform and validate them.
- Keep each DTO bounded: string lengths, numeric ranges, and maximum array sizes.
- Return domain errors with Nest exceptions; do not leak Prisma error details.

## Service contract

- Validate referenced IDs within the caller's tenant/company before writes.
- Scope writes by tenant/company in the write predicate, not only in a prior read.
- Use conditional updates for state transitions and stock mutations.
- Make retryable operations idempotent using a persisted unique business key.
- Emit audit events for sensitive transitions and redact secrets before logging.

## Before merging a domain

1. Add Prisma migration(s), never use `db push` for an evolved database.
2. Add tests for permission boundaries, tenant/company isolation, and transaction
   rollback behavior.
3. Run `npm run build`, `npm test`, and `npx prisma validate` from `server/`.
4. Update module catalog/default tenant configuration only when the new module is
   ready for users to enable.
