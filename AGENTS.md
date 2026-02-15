# Agents

## Deployment

Always create a **signed tag** when tagging a release:

```bash
git tag -s vX.Y.Z -m "vX.Y.Z"
```

Do not use lightweight or unsigned tags. Every release tag must be signed with a GPG key.
