# T-verify-fixes-w3: Fixes from the wave-3 native check
status: done
branch: worktree-wf_aab118ed-56b-15
changed: apps/mobile/src/dev/{sshHarness.ts,sshHarness.test.ts}, modules/ssh/README.md, e2e/hosts.yaml, packages/ui/src/primitives/Screen.tsx, apps/mobile/src/features/hosts/hosts.test.tsx, apps/mobile/src/notifications/{InAppBanner.tsx,InAppBanner.test.tsx}, apps/mobile/src/app/__gallery.tsx, packages/ui/src/gallery/{Gallery,galleryDemo,galleryFeedback}.tsx, packages/ui/src/overlay/{NativeActionMenu.tsx,overlay.test.tsx}
tests: pnpm verify-fast -> all green
acceptance:
- (1) __ssh pin: normalizePin restores a space to + and accepts base64url; README command uses the real scheme and documents %2B / base64url: met (sshHarness.test.ts)
- (2) e2e/hosts.yaml: hideKeyboard replaced by tapping the "Routes" label + scrollUntilVisible host-save: met (flow not run, integrator)
- (3) Screen ScrollView keyboardDismissMode on-drag (keyboardShouldPersistTaps was already handled); scroll gets testID `<screen>-scroll`: met (hosts.test.tsx)
- (4) Gallery "InAppBanner (3 s hold)" button (Gallery `demos` prop; useBannerDemo feeds a demo Host working -> blocked; demo Host triggers allowed, real Hosts still fail closed): met (InAppBanner.test.tsx)
- (5) Files menu button: the SwiftUI Host in NativeActionMenu gets seedColor = accent token (was system blue): met on the Host prop (test); the Files header title and up button already use theme tokens; look needs the integrator's native check
left:
- P5.1b still open: real console feed + triggers for the banner outside the demo
