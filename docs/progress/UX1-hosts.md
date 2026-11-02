# UX1-hosts: assemble Hosts sheet, detail, pairing scanner and form from the cloned components
status: partial
branch: ux1-hosts
changed: packages/ui/src/components/SheetBar.tsx (new), primitives/{Screen,ListRow,SectionHeader,Icon}.tsx, form/TextField.tsx (inline rows), scanner/{QRNotice,QRCamera,qrLabels}.ts(x); apps/mobile/src/app/{_layout,hosts/*}.tsx (Hosts is a modal group with its own Stack, screens draw a SheetBar), features/hosts/{HostListScreen,HostGroup,HostDetailScreen,HostInfoSections,PreflightSection,HostFormScreen,AuthFields,DeviceKeyLine,PairingScreen,SetupGuideScreen,SetupStep,setupGuideSteps,hostRows,pairingText}, dev/atlas/{entries,atlasMap.json,AtlasFrame,RemoveConfirmDemo}, packages/i18n extras (Routes footer)
tests: pnpm verify-fast -> green
acceptance:
- Hosts is a sheet with large title, leading Done, trailing glass capsule (scan, add): met (SheetBar; root declares `presentation: 'modal'`)
- groups in Swift order, fold chevron and count capsule (FoldHeader status): met
- row glyph+dot, name, mono user@address, chevron, retry on failed, swipe Remove with confirm: met (HostRow). Latency "<1 ms": not met, the Hosts model has no latency yet
- detail order status card (HostStatusCard), key change, routes (wifi tile, mono address, In Use), Host (KeyValueGroup), preflight with "Run Checks Again" in the header: met except the Plugin version row (no plugin version in the model)
- scanner: accent corner brackets + hint under the live camera, denied/unavailable as centered empty state, Add Manually: met by construction; web only shows the denied state (no camera), live frame is iOS-only
- form: inline grouped rows (Host, Authentication with Device Key line and copy row, herdr Session), Cancel/Save in the bar, footers: met. Routes are still inline cards, not the Swift route page
- new: hosts.setup-guide screen (segmented platform, numbered steps, copy blocks), Setup Guide link on the list
- atlas ids added: hosts.trust-alert, hosts.setup-guide, hosts.remove-confirm; hosts.detail now shows a trusted Host (AtlasData.trusted)
left: hosts.route-page / hosts.new-route (push a route page from the form row; needs a shared draft store), hosts.peer-picker (OverlayPeerPicker component exists, wiring belongs with the overlay sign-in), hosts.plugin-notice (plugin version in the model), hosts.replace-auth-key-confirm, Host latency, Plugin row, "Full Guide on GitHub" row, Setup Guide as a footnote link; Windows guide link and plugin repository in the guide are placeholders; Maestro hosts.yaml should be re-run by the integrator (testIDs kept: hosts-add, host-user, route-0-*, host-save, host-add-route; the Add Host button now sits in the sheet bar)
notes: SheetBar is a new reusable bar (UX1-settings can use it); Screen got a pinned `header` slot. The old hosts-scan/hosts-add testIDs moved to the bar actions. Preflight run link keeps testID host-run-checks. Evidence: /private/tmp/claude-501/-Users-eaprules/96b69bbe-4c3e-4245-9ae5-f3863fee18ff/scratchpad/rn/evidence/UX1-hosts/{dark,papel}/*.png
