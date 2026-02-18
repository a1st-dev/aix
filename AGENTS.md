# Agents

## Deployment

Always create a **signed tag** when tagging a release:

```bash
git tag -s vX.Y.Z -m "vX.Y.Z"
```

Do not use lightweight or unsigned tags. Every release tag must be signed with a GPG key.

### Creating a release

1. Ensure `main` is up to date and includes all release-ready changes.
2. Bump versions in `package.json` and `package-lock.json` files, then commit those changes.

```bash
npm run version:bump -- X.Y.Z
git add package.json package-lock.json packages/*/package.json
git commit -m "chore: release vX.Y.Z"
```

3. Ensure the repo is clean and the bumped version matches the tag you will create (`X.Y.Z` vs `vX.Y.Z`).
4. Run the local verification suite before tagging:

```bash
npm ci
npm run standards
npm test
npm run build
```

5. Create a signed release tag (required):

```bash
git tag -s vX.Y.Z -m "vX.Y.Z"
```

6. Push the commit and the tag:

```bash
git push origin main
git push origin vX.Y.Z
```

Pushing a `v*` tag triggers the GitHub release workflow, which publishes packages and creates the GitHub Release.
