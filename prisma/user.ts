// Create a login account or reset its password.
//
//   npm run user:set -- <username> <password> [--admin]
//
// Resetting a password also signs out every existing session. --admin makes the account an admin.
import { PrismaClient } from "@prisma/client";
import { hashPassword, MIN_PASSWORD_LENGTH } from "../src/lib/auth/password";

const db = new PrismaClient();

async function main() {
  const args = process.argv.slice(2);
  const admin = args.includes("--admin");
  const [username, password] = args.filter((a) => a !== "--admin");
  if (!username || !password) {
    console.error("Usage: npm run user:set -- <username> <password> [--admin]");
    process.exit(1);
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    console.error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
    process.exit(1);
  }
  const passwordHash = await hashPassword(password);
  const existing = await db.user.findUnique({ where: { username } });
  if (existing) {
    await db.user.update({
      where: { username },
      data: { passwordHash, sessionVer: { increment: 1 }, active: true, ...(admin ? { role: "admin" } : {}) },
    });
    console.log(`Password updated for "${username}"${admin ? " (admin)" : ""}`);
  } else {
    await db.user.create({ data: { username, passwordHash, role: admin ? "admin" : "user" } });
    console.log(`Created ${admin ? "admin" : "user"} "${username}"`);
  }
}

main().finally(() => db.$disconnect());
