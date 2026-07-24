# Use Neon Auth for user-owned routing configuration

Intentive uses Neon Auth, built on Better Auth, as the v1 identity foundation. Settings should render Neon Auth UI for sign-in/account state, while Agent Runtime Routing details remain internal configuration resolved from the signed-in Neon user and Control Plane, rather than entered manually by the user.

Manual endpoint/API-key fields were rejected because they make Intentive feel like a developer client. Neon Auth keeps the user-facing model product-owned: sign in with the same Google identity, then resolve the v1 Agent Runtime route and credential behind Auth.
