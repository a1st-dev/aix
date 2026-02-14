---
slug: cli/validate
sidebar:
   order: 5
title: aix validate
description: Verify your ai.json configuration.
---

Validates `ai.json` against the schema and checks for logical errors (e.g., missing files, invalid rule activation modes).

## Usage

```bash
aix validate
```

If errors are found, it prints the JSON path to the invalid field and a description of the error. It exits with code 1 on failure.
