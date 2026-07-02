# Backlogs

## Data & Privacy copy (Consent Primer)

The scaffold's Data & Privacy copy is omi's verbatim placeholder — it makes false claims for Intentive (audio recording, Deepgram, OpenAI) and has `#` policy links. Marked `TODO(polish)` and must not ship to a real build (per your earlier direction, and [ADR 0020](adr/0020-mobile-consent-primer-is-data-and-privacy-acceptance.md)).

Do this after the Intentive marketing site exists:

1. Configure `heyintentive.com` in the website host and GoDaddy DNS.
2. Create canonical legal routes:
   - `https://heyintentive.com/privacy`
   - `https://heyintentive.com/terms`
3. Publish plain, Intentive-accurate Privacy Policy and Terms of Service content at those routes.
4. Replace the Consent Primer placeholder body with Intentive's real data-processing disclosure.
5. Wire the Mobile Client links to the canonical routes above and add/adjust tests so `Privacy Policy` opens `/privacy` and `Terms of Service` opens `/terms`.
