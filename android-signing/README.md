# Test signing key

`test-key.p12` signs the **test APKs** that GitHub Actions builds for sideloading. Because every build uses the same key, a new APK installs over the old one and keeps your saves.

- Type: PKCS12, alias `test`, password `silentcontract`. It was made with `openssl` and is valid for 30 years.
- **This key is public. Never use it for Google Play.** A Play release gets its own upload key, stored as a GitHub secret, with Play App Signing turned on.
- If you replace this key, uninstall the old app from the phone once, because Android rejects updates signed with a different key.
