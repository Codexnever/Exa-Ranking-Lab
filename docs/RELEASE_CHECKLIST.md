# Exa Ranking Lab v1 release checklist

## Code
- [ ] `npm run check-types` passes
- [ ] `npm run lint` passes
- [ ] `npm test -- --runInBand` passes
- [ ] `npm run build` passes
- [ ] CI passes on the release commit
- [ ] README and DEVELOPER documentation are current
- [ ] Secret scan reviewed; no credentials are committed

## Infrastructure
- [ ] Required Appwrite environment variables are configured
- [ ] `node --check scripts/provision-evaluation-schema.mjs` passes
- [ ] Provisioning dry-run/inspect reports the expected schema
- [ ] Live provisioning succeeds and a repeated run is non-destructive
- [ ] Authentication and owner scoping are verified against the deployment project

## Product smoke tests
- [ ] Core pages and authentication load
- [ ] Frozen evaluation dataset flow completes
- [ ] Two evaluation runs compare successfully
- [ ] Document movement renders
- [ ] Stage trace and diagnosis render
- [ ] Hard-negative analysis renders
- [ ] Two imported strategies benchmark successfully
- [ ] Demo bundle was validated with `npm run seed:evaluation-demo`
- [ ] Screenshots are captured from the verified deployment

## Release operations
- [ ] Deployment health checked
- [ ] Git remote configured
- [ ] `codex/review-project-documentation` pushed
- [ ] Release notes reviewed
- [ ] Optional `v1.0.0` tag approved (do not create automatically)
