// Runs before `prisma db push` (see the setup and vercel-build scripts). Idempotent.
//
// Brings a database from the single-user schema to the multi-user one without losing data:
// adds role/active/name to User and makes the oldest account the admin, gives every existing
// row of personal data a userId owned by that admin, and re-keys Profile by userId.
// `prisma db push` then adds the NOT NULL constraints, foreign keys and indexes.
// A fresh database (no "User" table yet) is left alone for db push to create.
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL });

const OWNED = ["BodyLog", "Photo", "ImageBlob", "Meal", "Workout", "WeeklyReport"];

async function hasTable(table: string): Promise<boolean> {
  const rows = await db.$queryRaw<{ n: bigint }[]>`
    SELECT count(*) AS n FROM information_schema.tables
    WHERE table_schema = current_schema() AND table_name = ${table}`;
  return Number(rows[0].n) > 0;
}

async function hasColumn(table: string, column: string): Promise<boolean> {
  const rows = await db.$queryRaw<{ n: bigint }[]>`
    SELECT count(*) AS n FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = ${table} AND column_name = ${column}`;
  return Number(rows[0].n) > 0;
}

async function main() {
  if (!(await hasTable("User"))) {
    console.log("pre-push: fresh database, nothing to migrate");
    return;
  }

  for (const [col, def] of [
    ["role", `TEXT NOT NULL DEFAULT 'user'`],
    ["active", `BOOLEAN NOT NULL DEFAULT true`],
    ["name", `TEXT NOT NULL DEFAULT ''`],
  ]) {
    if (!(await hasColumn("User", col))) await db.$executeRawUnsafe(`ALTER TABLE "User" ADD COLUMN "${col}" ${def}`);
  }
  await db.$executeRawUnsafe(`
    UPDATE "User" SET role = 'admin'
    WHERE id = (SELECT id FROM "User" ORDER BY "createdAt" LIMIT 1)
      AND NOT EXISTS (SELECT 1 FROM "User" WHERE role = 'admin')`);
  const owner = (await db.$queryRaw<{ id: string }[]>`
    SELECT id FROM "User" WHERE role = 'admin' ORDER BY "createdAt" LIMIT 1`)[0]?.id;

  for (const table of OWNED) {
    if (!(await hasTable(table)) || (await hasColumn(table, "userId"))) continue;
    await db.$executeRawUnsafe(`ALTER TABLE "${table}" ADD COLUMN "userId" TEXT`);
    if (owner) {
      const n = await db.$executeRawUnsafe(`UPDATE "${table}" SET "userId" = $1`, owner);
      console.log(`pre-push: ${table}: ${n} row(s) assigned to the admin`);
    } else {
      await db.$executeRawUnsafe(`DELETE FROM "${table}"`);
    }
  }

  // Reports were unique per week; now per user and week. Creating the index here (no duplicates are
  // possible when one owner had them) keeps db push from flagging the new constraint as data loss.
  if (await hasTable("WeeklyReport")) {
    await db.$executeRawUnsafe(`DROP INDEX IF EXISTS "WeeklyReport_weekStart_key"`);
    await db.$executeRawUnsafe(
      `CREATE UNIQUE INDEX IF NOT EXISTS "WeeklyReport_userId_weekStart_key" ON "WeeklyReport"("userId", "weekStart")`,
    );
  }

  if ((await hasTable("Exercise")) && !(await hasColumn("Exercise", "userId"))) {
    await db.$executeRawUnsafe(`ALTER TABLE "Exercise" ADD COLUMN "userId" TEXT`);
  }

  if ((await hasTable("Profile")) && !(await hasColumn("Profile", "userId"))) {
    if (owner) {
      await db.$executeRawUnsafe(`ALTER TABLE "Profile" ADD COLUMN "userId" TEXT`);
      await db.$executeRawUnsafe(`UPDATE "Profile" SET "userId" = $1 WHERE id = (SELECT min(id) FROM "Profile")`, owner);
      await db.$executeRawUnsafe(`DELETE FROM "Profile" WHERE "userId" IS NULL`);
      await db.$executeRawUnsafe(`ALTER TABLE "Profile" DROP CONSTRAINT IF EXISTS "Profile_pkey"`);
      await db.$executeRawUnsafe(`ALTER TABLE "Profile" DROP COLUMN "id"`);
      await db.$executeRawUnsafe(`ALTER TABLE "Profile" ADD PRIMARY KEY ("userId")`);
      console.log("pre-push: Profile re-keyed by userId");
    } else {
      await db.$executeRawUnsafe(`DROP TABLE "Profile"`);
    }
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
