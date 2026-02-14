# @a1st/mcp-registry-client

TypeScript client for the [official MCP Registry API](https://registry.modelcontextprotocol.io).

## Installation

```bash
npm install @a1st/mcp-registry-client
```

## Quick Start

```typescript
import { McpRegistryClient } from "@a1st/mcp-registry-client";

const client = new McpRegistryClient();

// Search for servers
const results = await client.search("playwright");
console.log(results.servers);
```

## API

### `new McpRegistryClient(options?)`

Create a new client instance.

```typescript
const client = new McpRegistryClient({
   baseUrl: "https://registry.modelcontextprotocol.io", // default
   fetch: customFetch, // optional custom fetch implementation
});
```

### `client.search(query, options?)`

Search for servers by name. Returns latest versions by default.

```typescript
const results = await client.search("github");
// { servers: [...], metadata: { count: 5, nextCursor: '...' } }
```

### `client.list(options?)`

List servers with optional filtering and pagination.

```typescript
const results = await client.list({
   limit: 10,
   version: "latest",
   updatedSince: "2024-01-01T00:00:00Z",
});
```

### `client.getServer(name, version?)`

Get a specific server by name. Defaults to latest version.

```typescript
const server = await client.getServer("io.github.anthropics/mcp-server-github");
console.log(server.server.name); // 'io.github.anthropics/mcp-server-github'
console.log(server.server.description); // 'GitHub API integration'
console.log(server.server.packages); // Package configurations
```

### `client.getServerVersions(name)`

Get all versions of a server.

```typescript
const versions = await client.getServerVersions("io.github.anthropics/mcp-server-github");
for (const entry of versions.servers ?? []) {
   console.log(entry.server.version);
}
```

### `client.listAll(options?)`

Async generator that handles pagination automatically.

```typescript
for await (const server of client.listAll({ version: "latest" })) {
   console.log(server.server.name);
}
```

## Types

The package exports full TypeScript types for the MCP Registry API:

```typescript
import type {
   ServerJSON, // Server configuration
   ServerResponse, // Server + registry metadata
   ServerListResponse, // Paginated list response
   Package, // Package configuration (npm, pypi, etc.)
   Transport, // Transport config (stdio, http, sse)
   ListServersOptions, // Options for list/search
} from "@a1st/mcp-registry-client";
```

## Error Handling

The client throws `McpRegistryError` for API errors:

```typescript
import { McpRegistryClient, McpRegistryError } from "@a1st/mcp-registry-client";

try {
   await client.getServer("nonexistent/server");
} catch (error) {
   if (error instanceof McpRegistryError) {
      console.log(error.status); // HTTP status code
      console.log(error.message); // Error message
      console.log(error.response); // Full error response (if available)
   }
}
```

## Usage in aix

This package is used by the [aix CLI](https://github.com/a1st-dev/aix/blob/main/README.md)
to power `aix search` and `aix add mcp` commands. When you run:

```bash
aix search playwright
aix add mcp github
```

The CLI uses this client to query the MCP Registry and fetch server configurations.

## License

MIT
