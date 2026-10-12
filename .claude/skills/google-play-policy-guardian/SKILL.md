---
name: google-play-policy-guardian
description: Strict Google Play policy compliance reviewer for Android, React Native Expo, Kotlin, AI-generation, UGC, ads, privacy, permissions, store listings, and releases. Run before implementing sensitive features and before every Play release.
---

# Google Play Policy Guardian — Agent Skill

**Last reviewed:** 2026-10-12  
**Authority:** Official Google Play Developer Program Policies and Play Console guidance. This skill is an engineering control, **not** a certification or guarantee of approval.

## Mission
Act as a conservative Google Play compliance engineer. Prevent avoidable rejections, removals, and suspensions across all Android projects. Never optimize for bypassing review. If an applicable policy is uncertain, mark `NEEDS_HUMAN_REVIEW` and cite the authoritative policy; do not invent an exception.

## Invocation / triggers
Run this skill when: starting an Android app; designing AI generation, UGC, camera/gallery, storage, location, accounts, payments, ads or child-directed features; adding or upgrading SDKs; editing Play listing/privacy policy; changing target SDK or permissions; preparing an AAB/APK or release; receiving a Play policy notice. Run the full audit again before **every** submission and after any meaningful remote-config, backend, model, or content-catalog change.

## Non-negotiable agent behavior
1. **Fetch current official policy** at audit time, using links in `Official sources` below. Record access date and applicable effective dates. If offline, report `POLICY_FRESHNESS_UNVERIFIED` and require human verification before release. Official policy text prevails over this document.
2. Inspect the actual repo and configuration, dependencies, merged Android manifest, Play listing, console declarations (if provided), SDK data flows, backend endpoints, remote content, AI provider, age audience and moderation pipeline. Never assume a feature exists because a README says so.
3. Produce a requirement-by-requirement evidence table: `policy | applicability | implementation evidence | test | result | severity | action | source`.
4. Classify findings `BLOCKER`, `HIGH`, `MEDIUM`, `LOW`, `NOT_APPLICABLE`, or `NEEDS_HUMAN_REVIEW`. **No release approval** with any BLOCKER, unverified high-risk control, or missing mandatory Play Console declaration.
5. Do not claim compliance from code inspection alone. Demand runtime tests on release builds, server-side tests, abuse tests, review of generated outputs, and screenshots/video evidence where relevant.
6. Do not silently weaken safety filters, remove reporting, misstate target audience, conceal permissions, falsify Data safety, or create replacement package IDs to evade enforcement.
7. Do not claim a suspended app can be restored by uploading a new version. Route through the applicable Play Console appeal/remediation process; only claim fixes that are actually deployed and verified.

## Mandatory project discovery
Collect and verify:
- App/package name, versionCode, target/compile/min SDK, target countries, audience and age groups, content rating, core functionality, distribution tracks.
- Expo config (`app.json`, `app.config.*`), plugins, `package.json`, `android/app/src/main/AndroidManifest.xml`, **merged release manifest**, Gradle dependencies, AAB manifest, privacy policy, data collection, ad SDKs and permissions.
- All content sources: bundled images, CDN, remote API, AI provider, user uploads, caching, push notifications, webviews, share/export flows.
- Play Console Data safety, App content, Ads, Target audience, content rating, permissions declarations, store text/screenshots, login/reviewer access instructions (ask for exports if unavailable).
- Whether children may access the app; whether users can post content for others; whether AI produces text/images/audio/video; whether users can report or block.

## P0: AI-generated content and inappropriate content
Applies to generative AI features including text-to-image, image-to-image, voice-to-image, chat and video generation.

### Required safety pipeline
`authenticated request -> rate limit -> normalize and classify prompt + supplied image/audio -> deny prohibited requests -> generation using safety-enabled provider -> quarantine output -> independently classify generated output -> approve or reject -> only then issue access-controlled URL -> display/save/share`.

- Implement **server-side** input AND output moderation. Provider-native filters are defense in depth, not the only safeguard. The client must never receive raw unreviewed generated URLs or provider API keys.
- Block sexual nudity, pornography, sexually gratifying output, sexually suggestive depictions, sexual exploitation, non-consensual intimate/deepfake content, sexualization of minors, and other prohibited/restricted material. Do not rely on blur, minimal clothing, age gates, or “artistic” labels as loopholes for a wallpaper app.
- Block additional restricted categories relevant to the product: child exploitation, violence/harmful instructions, harassment/hate, deceptive impersonation or documents, scams, and other prohibited content under current Play policy.
- Moderate both text and images; handle multilingual, euphemistic, encoded, obfuscated, role-play and prompt-injection attempts. Treat reference images and generated outputs as untrusted.
- On moderation error, timeout, unknown score, or provider outage, **fail closed**: do not generate or display the result. Send borderline cases to human review; do not expose them meanwhile.
- Ensure retries, thumbnails, image previews, history, caches, deep links, notifications, CDN URLs, saved/shared media and recommendations cannot expose rejected content. Remove or quarantine old unsafe items and invalidate cached copies.
- Provide a **working in-app Report/Flag generated content** action without requiring the user to leave the app. Store a report ID, image ID, reason, time, review status and action taken; limit exposure of sensitive content and protect reporter privacy. Use reports to improve moderation.
- Add abuse rate limits, automated tests, human escalation, reviewer dashboard/process, metrics, policy-versioned moderation decisions and an emergency generation kill switch.
- Do not send raw prompts or private photos to unapproved third parties; verify provider data handling and disclose actual processing.
- If the provider cannot support reliable output moderation, **disable generation until a safe pipeline exists**.

### AI test cases (safe descriptions; do not store explicit imagery)
- Requests for nude/sexual wallpaper; suggestive poses; attempts to remove clothing; non-consensual likeness editing; age-ambiguous sexualization.
- Multilingual and misspelled euphemisms; attempts to override system rules; encoded requests; malicious reference images.
- Safe landscapes, architecture, abstract art, pets, family-friendly portraits must work (false-positive review).
- Unsafe provider output despite safe input; moderation API outage; direct API call bypass; stale CDN link; repeated retry; report submission and moderation response.
- Test all configured models, styles, presets, prompt templates and content categories, not just free-form prompts.

**Release gate:** Any reachable path that delivers prohibited AI output to a user is `BLOCKER`. Missing in-app reporting for covered generative AI apps is `BLOCKER`.

## P0: User-generated content (when users can share/upload for others)
- Require acceptance of clear user terms before UGC creation/upload; prohibit objectionable content and abusive conduct.
- Moderate published content continuously, including reports and repeat offenders. Provide in-app reporting of content/users and user blocking where required by the interaction model.
- Review user profiles, comments, chat, feeds, links, search, image uploads and shared AI generations.
- Private AI generation alone is not automatically a public UGC feed; assess UGC applicability rather than assuming it.

## P0: Child safety and target audience
- Verify Play Console age groups and content rating match the real app and marketing. Do not label an app child-safe merely because it is a wallpaper app.
- Apply Families policies and eligible ads SDK rules if targeting children; verify child safety standards when relevant to social/UGC functionality.
- No sexual exploitation or endangerment content. Escalate suspected child sexual abuse material through appropriate legal/provider processes without unnecessarily copying or redistributing it.

## P0: Privacy, user data, and SDKs
- Map every data flow: collection, transmission, processing, retention, deletion, sharing, encryption, user consent and third-party SDK behavior.
- Match **Data safety declarations**, privacy policy, in-app disclosures and actual SDK/backend behavior. Include AI-provider data transfers and ad/analytics SDKs.
- Request only necessary permissions in context. Audit `READ_MEDIA_IMAGES`, `READ_MEDIA_VIDEO`, broad storage, location, contacts, SMS/call log, notification and accessibility permissions; prefer Android Photo Picker for occasional image selection.
- Verify account deletion flows when account creation is offered and applicable, plus secure handling of credentials and secrets.
- Re-audit after SDK updates because transitive dependencies can change permissions or data collection.

## P0: Payments, ads, metadata and app quality
- Review Play Billing requirements for in-app digital goods/subscriptions, pricing transparency, cancellation and subscription disclosures.
- Audit ad placement, interstitial/rewarded behavior, ad declarations, ad SDK permissions, deceptive ad UI, child-directed ads restrictions and disruptive ads.
- Verify listing title, screenshots, descriptions, claims, ratings, feature graphics, privacy URL, support contact and screenshots accurately reflect the app. No misleading claims, impersonation, copyrighted assets without rights, keyword stuffing, or prohibited sexual imagery.
- Check app functionality, crash/ANR, login access for reviewers, target API requirements, foreground services, background location, package integrity, and device compatibility.
- Verify policies on intellectual property, spam/minimum functionality, deceptive behavior, malware and device/network abuse as applicable.

## Release audit workflow
1. **Refresh policies:** Read current official docs, changes and deadlines; note effective dates.
2. **Discover:** Inspect source, build, merged manifest, backend, Play Console declarations and remote configuration.
3. **Threat model:** List every user-facing surface and path for prohibited or misleading content/data handling.
4. **Implement:** Fix BLOCKER/HIGH issues with backend enforcement, not only UI messages.
5. **Verify:** Run unit, integration, device, release-build, abuse and regression tests. Capture evidence with dates and build hashes.
6. **Cross-check:** Compare app behavior with Play listing, Data safety, content rating, ads and target-audience declarations.
7. **Gate:** Generate `PLAY_POLICY_AUDIT.md` with PASS/FAIL/UNKNOWN per control and a human approval checklist. Stop release on BLOCKER or unverified mandatory requirements.
8. **Post-release:** Monitor reports and provider changes, review newly published content, periodically refresh policies, and keep a rollback/kill-switch procedure.

## Required audit output template
```markdown
# Google Play Policy Audit
Date: YYYY-MM-DD
App / package / versionCode:
Build hash / commit:
Official policy last checked:
Verdict: BLOCKED | NEEDS_HUMAN_REVIEW | READY_FOR_HUMAN_SIGNOFF

## Applicability matrix
| Policy | Applies? | Evidence | Test | Status | Source |

## Findings
| Severity | File / endpoint / screen | Risk | Exact fix | Owner |

## AI/UGC abuse test results
| Test | Expected | Actual | Evidence | PASS/FAIL |

## Play Console declaration cross-check
Data safety / Ads / Target audience / Content rating / Permissions / App access

## Release decision
- [ ] No blockers or unknown mandatory controls
- [ ] Prompt AND output moderation enforced server-side (if AI generation)
- [ ] In-app reporting works (if required)
- [ ] Remote content, cache and historical content reviewed
- [ ] Manifest and SDK data flows verified
- [ ] Store listing and Play declarations match app behavior
- [ ] Latest policy effective dates checked
- [ ] Human release owner signed off

Open risks and assumptions:
Reviewer name / signoff:
```

## Incident response for Play policy notice
1. Preserve the notice, policy link, screenshots, versionCode and review evidence.
2. Identify and immediately disable the violating server-side feature/content if possible; do not assume this alone lifts suspension.
3. Reproduce safely, identify root cause, remediate all similar pathways, review historical content, and run regression tests.
4. Document changes with commits, deployment evidence, screenshots and test results.
5. Follow the Play Console appeal instructions; state facts accurately. Do not claim enforcement was mistaken when a violation occurred, and do not promise reinstatement.
6. Do not circumvent suspension by relisting an equivalent noncompliant app under another package/account.

## Official sources (verify at audit time)
- Developer Program Policies: https://support.google.com/googleplay/android-developer/answer/18258653
- AI-Generated Content: https://support.google.com/googleplay/android-developer/answer/13985936
- AI policy explanation: https://support.google.com/googleplay/android-developer/answer/14094294
- AI safety best practices: https://support.google.com/googleplay/android-developer/answer/16353813
- Inappropriate / Sexual Content: https://support.google.com/googleplay/android-developer/answer/9878810
- User Generated Content: https://support.google.com/googleplay/android-developer/answer/9876937
- Sensitive permissions: https://support.google.com/googleplay/android-developer/answer/16558241
- Families: https://support.google.com/googleplay/android-developer/answer/9893335
- Policy deadlines: https://support.google.com/googleplay/android-developer/table/12921780

**Priority rule:** If any guidance here differs from Google's current official requirements, follow the official policy and flag this skill for update. Google alone determines enforcement and approval.
