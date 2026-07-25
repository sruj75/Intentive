#!/usr/bin/env node

function usage() {
  console.log(`Usage: mint-release-test-jwt.mjs

Required environment:
  INTENTIVE_NEON_AUTH_URL
  DESKTOP_RELEASE_TEST_ACCOUNT_EMAIL
  DESKTOP_RELEASE_TEST_ACCOUNT_PASSWORD

Prints only the freshly minted raw JWT to stdout.`);
}

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  usage();
  process.exit(0);
}

const baseURL = process.env.INTENTIVE_NEON_AUTH_URL?.replace(/\/+$/, "");
const email = process.env.DESKTOP_RELEASE_TEST_ACCOUNT_EMAIL;
const password = process.env.DESKTOP_RELEASE_TEST_ACCOUNT_PASSWORD;
if (!baseURL || !email || !password) {
  throw new Error(
    "INTENTIVE_NEON_AUTH_URL, DESKTOP_RELEASE_TEST_ACCOUNT_EMAIL, and DESKTOP_RELEASE_TEST_ACCOUNT_PASSWORD are required",
  );
}

function cookiesFrom(response) {
  const values = response.headers.getSetCookie?.() ?? [];
  const fallback = response.headers.get("set-cookie");
  return (values.length ? values : fallback ? [fallback] : [])
    .map((value) => value.split(";", 1)[0])
    .join("; ");
}

const signIn = await fetch(`${baseURL}/api/auth/sign-in/email`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email, password }),
  redirect: "manual",
});
if (!signIn.ok) {
  throw new Error(`release-test sign-in failed with HTTP ${signIn.status}`);
}
const cookie = cookiesFrom(signIn);
if (!cookie) throw new Error("release-test sign-in returned no session cookie");

const tokenResponse = await fetch(`${baseURL}/api/auth/token`, {
  headers: { cookie },
  redirect: "manual",
});
if (!tokenResponse.ok) {
  throw new Error(`release-test JWT mint failed with HTTP ${tokenResponse.status}`);
}
const payload = await tokenResponse.json();
const token = payload.token ?? payload.jwt ?? payload.data?.token;
if (typeof token !== "string" || token.split(".").length !== 3) {
  throw new Error("Neon Auth token response did not contain a JWT");
}
process.stdout.write(`${token}\n`);
