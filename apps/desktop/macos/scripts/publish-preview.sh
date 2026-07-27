#!/usr/bin/env bash
set -euo pipefail

MACOS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "$MACOS_DIR/../../.." && pwd)"
BUILD_SCRIPT="$MACOS_DIR/scripts/build-app-bundle.sh"
VERIFY_SCRIPT="$MACOS_DIR/scripts/verify-app-bundle.sh"
PREVIEW_TAG="${INTENTIVE_PREVIEW_RELEASE_TAG:-desktop-preview}"
APP_NAME="Intentive Preview"
BUNDLE_ID="com.heyintentive.desktop.preview"
AUTH_CALLBACK_SCHEME="intentive-desktop-preview"
LAUNCH_AGENT_LABEL="com.heyintentive.desktop.preview.login-launcher-v1"
SIGNING_IDENTITY="${INTENTIVE_PREVIEW_SIGNING_IDENTITY:-Developer ID Application: Srujan Gowda (24D6NXS6H7)}"
CONTROL_PLANE_URL="${INTENTIVE_CONTROL_PLANE_URL:-}"
HOSTED_AUTH_URL="${INTENTIVE_HOSTED_AUTH_URL:-}"
AUTH_TOKEN_EXCHANGE_URL="${INTENTIVE_AUTH_TOKEN_EXCHANGE_URL:-}"
SPARKLE_PUBLIC_ED_KEY="${INTENTIVE_SPARKLE_PUBLIC_ED_KEY:-}"
SPARKLE_PRIVATE_KEY="${INTENTIVE_SPARKLE_PRIVATE_KEY:-}"
SENTRY_DSN="${INTENTIVE_SENTRY_DSN:-}"
POSTHOG_PROJECT_KEY="${INTENTIVE_POSTHOG_PROJECT_KEY:-}"
POSTHOG_HOST="${INTENTIVE_POSTHOG_HOST:-https://us.i.posthog.com}"
DIST_DIR="$REPO_ROOT/dist/desktop-preview"

fail() {
  echo "Desktop Preview publish failed: $*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "$1 is required"
}

require_value() {
  [[ -n "$2" ]] || fail "$1 is required"
}

for command in codesign ditto gh git node security stat xmllint; do
  require_command "$command"
done

[[ -z "$(git -C "$REPO_ROOT" status --porcelain)" ]] \
  || fail "the repository must be clean; commit or stash changes first"

require_value "INTENTIVE_CONTROL_PLANE_URL" "$CONTROL_PLANE_URL"
require_value "INTENTIVE_HOSTED_AUTH_URL" "$HOSTED_AUTH_URL"
require_value "INTENTIVE_SPARKLE_PUBLIC_ED_KEY" "$SPARKLE_PUBLIC_ED_KEY"
require_value "INTENTIVE_SPARKLE_PRIVATE_KEY" "$SPARKLE_PRIVATE_KEY"
require_value "INTENTIVE_SENTRY_DSN" "$SENTRY_DSN"
require_value "INTENTIVE_POSTHOG_PROJECT_KEY" "$POSTHOG_PROJECT_KEY"

security find-identity -v -p codesigning \
  | grep -F "$SIGNING_IDENTITY" >/dev/null \
  || fail "Developer ID identity is unavailable: $SIGNING_IDENTITY"

GIT_SHA="$(git -C "$REPO_ROOT" rev-parse HEAD)"
REPOSITORY="${GITHUB_REPOSITORY:-$(gh repo view --json nameWithOwner --jq .nameWithOwner)}"
[[ "$REPOSITORY" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] \
  || fail "could not resolve a valid GitHub owner/repository"
[[ "$PREVIEW_TAG" =~ ^[A-Za-z0-9._-]+$ ]] || fail "Preview release tag is invalid"
APP_VERSION="${INTENTIVE_APP_VERSION:-$(
  node -p "require('$REPO_ROOT/apps/desktop/package.json').version"
)}"
APP_BUILD="${INTENTIVE_APP_BUILD:-$(date -u +%Y%m%d%H%M%S)}"
[[ "$APP_VERSION" =~ ^[0-9]+([.][0-9]+){1,2}$ ]] || fail "Preview app version is invalid"
[[ "$APP_BUILD" =~ ^[0-9]+$ ]] || fail "Preview app build must contain only digits"
FEED_NAME="appcast-preview.xml"
ZIP_NAME="Intentive-Preview.zip"
FEED_URL="https://github.com/$REPOSITORY/releases/download/$PREVIEW_TAG/$FEED_NAME"
ZIP_URL="https://github.com/$REPOSITORY/releases/download/$PREVIEW_TAG/$ZIP_NAME"

mkdir -p "$DIST_DIR"
APP_BUNDLE="$(
  CONFIGURATION=release \
    GITHUB_REPOSITORY="" \
    INTENTIVE_APP_NAME="$APP_NAME" \
    INTENTIVE_BUNDLE_ID="$BUNDLE_ID" \
    INTENTIVE_APP_VERSION="$APP_VERSION" \
    INTENTIVE_APP_BUILD="$APP_BUILD" \
    INTENTIVE_AUTH_CALLBACK_SCHEME="$AUTH_CALLBACK_SCHEME" \
    INTENTIVE_LAUNCH_AGENT_LABEL="$LAUNCH_AGENT_LABEL" \
    INTENTIVE_CONTROL_PLANE_URL="$CONTROL_PLANE_URL" \
    INTENTIVE_HOSTED_AUTH_URL="$HOSTED_AUTH_URL" \
    INTENTIVE_AUTH_TOKEN_EXCHANGE_URL="$AUTH_TOKEN_EXCHANGE_URL" \
    INTENTIVE_SPARKLE_FEED_URL="$FEED_URL" \
    INTENTIVE_SPARKLE_PUBLIC_ED_KEY="$SPARKLE_PUBLIC_ED_KEY" \
    INTENTIVE_SENTRY_DSN="$SENTRY_DSN" \
    INTENTIVE_POSTHOG_PROJECT_KEY="$POSTHOG_PROJECT_KEY" \
    INTENTIVE_POSTHOG_HOST="$POSTHOG_HOST" \
    "$BUILD_SCRIPT" | tail -n 1
)"
[[ -d "$APP_BUNDLE" ]] || fail "bundle builder did not produce $APP_NAME.app"

for framework in \
  "$APP_BUNDLE/Contents/Frameworks/Sparkle.framework" \
  "$APP_BUNDLE/Contents/Frameworks/Sentry.framework"; do
  codesign --force --options runtime --timestamp --deep \
    --sign "$SIGNING_IDENTITY" "$framework"
done
codesign --force --options runtime --timestamp \
  --sign "$SIGNING_IDENTITY" \
  "$APP_BUNDLE/Contents/MacOS/IntentiveLoginLauncher"
codesign --force --options runtime --timestamp \
  --entitlements "$MACOS_DIR/Desktop/Intentive-Release.entitlements" \
  --sign "$SIGNING_IDENTITY" \
  "$APP_BUNDLE"
codesign --verify --deep --strict --verbose=2 "$APP_BUNDLE"

CONFIGURATION=release \
  INTENTIVE_APP_NAME="$APP_NAME" \
  INTENTIVE_BUNDLE_ID="$BUNDLE_ID" \
  INTENTIVE_APP_VERSION="$APP_VERSION" \
  INTENTIVE_APP_BUILD="$APP_BUILD" \
  INTENTIVE_AUTH_CALLBACK_SCHEME="$AUTH_CALLBACK_SCHEME" \
  INTENTIVE_LAUNCH_AGENT_LABEL="$LAUNCH_AGENT_LABEL" \
  INTENTIVE_CONTROL_PLANE_URL="$CONTROL_PLANE_URL" \
  INTENTIVE_HOSTED_AUTH_URL="$HOSTED_AUTH_URL" \
  INTENTIVE_AUTH_TOKEN_EXCHANGE_URL="$AUTH_TOKEN_EXCHANGE_URL" \
  INTENTIVE_SPARKLE_FEED_URL="$FEED_URL" \
  INTENTIVE_SPARKLE_PUBLIC_ED_KEY="$SPARKLE_PUBLIC_ED_KEY" \
  INTENTIVE_SENTRY_DSN="$SENTRY_DSN" \
  INTENTIVE_POSTHOG_PROJECT_KEY="$POSTHOG_PROJECT_KEY" \
  INTENTIVE_POSTHOG_HOST="$POSTHOG_HOST" \
  "$VERIFY_SCRIPT" --app "$APP_BUNDLE"

ZIP_PATH="$DIST_DIR/$ZIP_NAME"
FEED_PATH="$DIST_DIR/$FEED_NAME"
rm -f "$ZIP_PATH" "$FEED_PATH"
ditto -c -k --sequesterRsrc --keepParent "$APP_BUNDLE" "$ZIP_PATH"

SPARKLE_SIGN_UPDATE="$(
  find "$("$REPO_ROOT/scripts/development-storage.sh" path swiftpm-desktop)" \
    -path '*/Sparkle/bin/sign_update' -type f -perm -111 | head -n 1
)"
[[ -x "$SPARKLE_SIGN_UPDATE" ]] || fail "Sparkle sign_update tool was not found"
SIGNATURE="$(
  printf '%s' "$SPARKLE_PRIVATE_KEY" \
    | "$SPARKLE_SIGN_UPDATE" --ed-key-file - -p "$ZIP_PATH"
)"
ZIP_BYTES="$(stat -f '%z' "$ZIP_PATH")"

cat > "$FEED_PATH" <<EOF
<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0" xmlns:sparkle="http://www.andymatuschak.org/xml-namespaces/sparkle">
  <channel>
    <title>Intentive Desktop Preview Updates</title>
    <item>
      <title>Intentive Preview $APP_VERSION ($APP_BUILD)</title>
      <sparkle:version>$APP_BUILD</sparkle:version>
      <sparkle:shortVersionString>$APP_VERSION</sparkle:shortVersionString>
      <sparkle:minimumSystemVersion>14.0</sparkle:minimumSystemVersion>
      <pubDate>$(date -u +"%a, %d %b %Y %H:%M:%S %z")</pubDate>
      <enclosure
        url="$ZIP_URL"
        sparkle:edSignature="$SIGNATURE"
        length="$ZIP_BYTES"
        type="application/octet-stream" />
    </item>
  </channel>
</rss>
EOF
xmllint --noout "$FEED_PATH"

RELEASE_NOTES="Developer dogfood build from \`$GIT_SHA\`.

This is Intentive Preview, not the consumer Desktop release. It is Developer ID
signed, delivered as a Sparkle ZIP, and intentionally has no DMG or notarization gate."

if gh release view "$PREVIEW_TAG" --repo "$REPOSITORY" >/dev/null 2>&1; then
  gh release edit "$PREVIEW_TAG" \
    --repo "$REPOSITORY" \
    --prerelease \
    --title "Intentive Desktop Preview" \
    --notes "$RELEASE_NOTES"
else
  gh release create "$PREVIEW_TAG" \
    --repo "$REPOSITORY" \
    --target "$GIT_SHA" \
    --prerelease \
    --title "Intentive Desktop Preview" \
    --notes "$RELEASE_NOTES"
fi
gh release upload "$PREVIEW_TAG" \
  "$ZIP_PATH" \
  "$FEED_PATH" \
  --repo "$REPOSITORY" \
  --clobber

echo "Published Intentive Preview $APP_VERSION ($APP_BUILD) from $GIT_SHA"
echo "Release: https://github.com/$REPOSITORY/releases/tag/$PREVIEW_TAG"
echo "Install with: pnpm --dir apps/desktop preview:install"
