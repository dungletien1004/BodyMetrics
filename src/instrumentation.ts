// Runs once per server instance before any request. Hosts like Vercel run in UTC, but day
// keys ("today"), meal times and late-night eating are all about the user's local clock.
// Node re-reads TZ when it is assigned, so every Date after this uses the app's timezone.
export function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    process.env.TZ = process.env.APP_TIMEZONE || "Asia/Ho_Chi_Minh";
  }
}
