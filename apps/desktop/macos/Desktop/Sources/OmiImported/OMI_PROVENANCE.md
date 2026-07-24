# Omi UI provenance

The files under this directory were copied before adaptation from:

- Repository: `https://github.com/BasedHardware/omi`
- Commit: `c55f2925eba6d98f0c1658535425f7405e5d5b9b`
- Source root: `desktop/macos/Desktop/Sources`

The Theme directory remains byte-identical and is compiled as the `OmiTheme`
SwiftPM target. Settings and setup sources were copied in the import checkpoint,
then pruned in place into the compiled `IntentiveDesktopPresentation` target. Deleted rows below
document copied material evaluated and removed during pruning; the retained
Settings shell and setup views are adapted at their original paths. Backend
bindings live exclusively in `IntentiveDesktopPresentationAdapter.swift`.

| Imported source | Git blob |
| --- | --- |
| `MainWindow/SettingsSidebar.swift` | `30735a1b118d4fd3f6603d74f361ea6be347c2b5` |
| `MainWindow/Pages/SettingsPage.swift` | `cf103da40bc0e42fcfc1fca3837e3e1ae339a2c1` |
| `MainWindow/Pages/Settings/Components/AppRuleEditorView.swift` | `625abd930c3e4020e0ff55a93d7a07ed6afafad4` |
| `MainWindow/Pages/Settings/Components/SearchableDropdown.swift` | `1bf89f8177f8e25ed0c2c9d265b949e8816aa733` |
| `MainWindow/Pages/Settings/Components/SettingsContentView+Controls.swift` | `feaa3a0321867e5d396e6a9061fbf6c8c7f8ab3b` |
| `MainWindow/Pages/Settings/Components/SettingsContentView+SettingsUpdates.swift` | `902aeadbce643a3d95bf9c04c11311ea182e7573` |
| `MainWindow/Pages/Settings/Sections/SettingsContentView+General.swift` | `873af7759ad9d46ef1eef6cb721362caf009c15e` |
| `MainWindow/Pages/Settings/Sections/SettingsContentView+NotificationsPrivacy.swift` | `92fa94e4458ef75d963c16e18b7a99eb4b64046d` |
| `MainWindow/Pages/Settings/Sections/SettingsContentView+Rewind.swift` | `052ba9ba75102a414f0b06e97afbe3f25fcfe27d` |
| `MainWindow/Pages/ShortcutsSettingsSection.swift` | `ee8149815684aa93af2e28b117b8d05674418d92` |
| `SignInView.swift` | `d4db90cc633779398561fcf9802f5941241ab68e` |
| `Onboarding/OnboardingStepScaffold.swift` | `5cc8c8424b309418804ef0efe5b22dafbf253566` |
| `Onboarding/OnboardingTrustStepView.swift` | `8815c3ba126fe9c9f861ede25b4d7f1cccbadc45` |
| `Onboarding/OnboardingPermissionStepView.swift` | `ed5932f6cff689aa1fad814ff8f975915ce20b81` |
| `Onboarding/OnboardingFloatingBarShortcutStepView.swift` | `d9fac98bcc52a6b338ab8029c8aeacad2e6c9390` |
| `Onboarding/OnboardingFloatingBarDemoView.swift` | `d11f87e4e1a7cb401c2488d783a1226ac2f4164c` |
| `Onboarding/PermissionDragGuidance.swift` | `2c83aeb20e99489d50095f62d4d992e8cf8ba145` |
| `Theme/OmiButtonStyle.swift` | `82dad1c6fda05cae2a65f1b9f01e2ba6f9b7fab2` |
| `Theme/OmiChrome.swift` | `e15e13b916df08776426ef1eefa03e6ea5bda8fe` |
| `Theme/OmiColors.swift` | `5a42662ea9c20d7fa5796ffe3be9befa2fd56850` |
| `Theme/OmiFont.swift` | `d2b0b767baed4567ff80fa4ebfa78e393096cdf4` |
| `Theme/OmiMotion.swift` | `3a88560f94449043797ce96fffe1da3f505e3075` |
| `Theme/OmiSpacing.swift` | `3ce994c5615fb058bc059dbc469e8cb76288981e` |
| `Theme/OmiToggleStyle.swift` | `6f13f4af5ac4ec08676345ffc04558304aaa979d` |
| `Theme/OmiType.swift` | `8215b50256b63b45fe5e4b9fe0a70e57de9e3770` |
