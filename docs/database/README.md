# Database documentation

`schema.dbml` is a human-readable mirror of the database, for viewing the ERD and for
reading the shape of the data without opening TypeScript.

## Viewing it

Paste `schema.dbml` into [dbdiagram.io](https://dbdiagram.io). No account needed.

## Source of truth

This file is **documentation, not schema**. The real definitions are:

| What | Where |
|---|---|
| Application tables | `api/drizzle/schema.ts` |
| Auth tables | `api/drizzle/auth-schema.ts` (generated — see below) |
| What is actually applied | `api/drizzle/migrations/` |

## The rule

**Update `schema.dbml` in the same commit that changes the schema.** Not the next
commit, not "later".

A stale ERD is worse than no ERD: nobody distrusts a diagram, so the first person to
plan against it plans against a schema that does not exist. If a change is too small
to be worth updating the diagram for, it is small enough to update in thirty seconds.

Include in the update: new or removed tables and columns, type or nullability changes,
new indexes and constraints, and the `Last updated` line at the top naming the
migration.

## Conventions this schema follows

**Every timestamp is `timestamptz`.** A bare `timestamp` carries no offset, so its
value means whatever the reading process assumes — fine while every container runs
UTC, silently wrong the first time one does not, and the failure is invisible: no
error, just times that are hours off. `api/src/config/schema-timezone.test.ts` fails
the build if any column regresses.

Note that `npx @better-auth/cli generate` emits bare `timestamp(...)` every time it
runs, so `{ withTimezone: true }` must be re-applied to `auth-schema.ts` after any
regeneration. That test is what catches it.

**PostGIS columns are not in the Drizzle schema.** `zones.geometry` has no Drizzle
type, so it is added by a raw SQL migration and accessed through `sql` templates
(ADR-011). Declaring it as some other type would make the next `drizzle-kit generate`
try to alter or drop it.

**Times are stored as instants; WIB is a presentation and query concern.** BR-006's
daily capture limit counts per Jakarta calendar day, done in the query with
`AT TIME ZONE 'Asia/Jakarta'` — not by storing local time.

## Regenerating by hand vs. automatically

`schema.dbml` is currently hand-maintained. `drizzle-dbml-generator` could produce it
from the Drizzle schema, which would remove the drift risk entirely — but it is a new
dependency, and it cannot express the PostGIS column or the functional unique index on
`lower(email)`, both of which would then need appending by hand anyway. Worth
revisiting if the schema grows faster than the discipline holds.
