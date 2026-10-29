// Create the login account or reset its password.
//
//   npm run user:set -- <username> <password>
//
// Resetting a password also signs out every existing session.
import { PrismaClient } from "@prisma/client";
import { hashPassword, MIN_PASSWORD_LENGTH } from "../src/lib/auth/password";

const db = new PrismaClient();

async function main() {
  const [username, password] = process.argv.slice(2);
  if (!username || !password) {
    console.error("Usage: npm run user:set -- <username> <password>");
    process.exit(1);
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    console.error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
    process.exit(1);
  }
  const passwordHash = await hashPassword(password);
  const existing = await db.user.findUnique({ where: { username } });
  if (existing) {
    await db.user.update({ where: { username }, data: { passwordHash, sessionVer: { increment: 1 } } });
    console.log(`Password updated for "${username}"`);
  } else {
    await db.user.create({ data: { username, passwordHash } });
    console.log(`Created user "${username}"`);
  }
}

main().finally(() => db.$disconnect());
