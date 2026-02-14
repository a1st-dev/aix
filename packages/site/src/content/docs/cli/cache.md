---
slug: cli/cache
sidebar:
   order: 10
title: aix cache
description: Manage the local cache.
---

aix caches downloaded rules and remote configs in `.aix/.tmp/cache/`. Skills are stored separately in `.aix/skills/`.

## Usage

```bash
aix cache clear
```

Alias: `aix cache clean`

Removes all cached files under `.aix/.tmp/`. They will be re-downloaded on the next `aix install`.
