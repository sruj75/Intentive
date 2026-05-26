# Use Neon Auth for user-owned Agent Interface configuration

Intentive uses Neon Auth, built on Better Auth, as the v1 identity foundation. Settings should render Neon Auth UI for sign-in/account state, while endpoint URLs and API keys remain internal Agent Interface configuration resolved from the signed-in Neon user rather than entered manually by the user.

Manual endpoint/API-key fields were rejected because they make Intentive feel like a developer client. Neon Auth keeps the user-facing model product-owned: sign in with the same Google identity associated with the OpenClaw Agent, then resolve the one v1 agent endpoint and credential behind Auth.
