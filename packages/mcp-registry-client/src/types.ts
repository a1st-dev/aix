/**
 * Types for the official MCP Registry API.
 * Based on the OpenAPI spec at https://registry.modelcontextprotocol.io/openapi.yaml
 */

/** Input format types */
export type InputFormat = 'string' | 'number' | 'boolean' | 'filepath';

/** Transport types */
export type TransportType = 'stdio' | 'streamable-http' | 'sse';

/** Registry types for packages */
export type RegistryType = 'npm' | 'pypi' | 'oci' | 'nuget' | 'mcpb';

/** Server lifecycle status */
export type ServerStatus = 'active' | 'deprecated' | 'deleted';

/** Icon theme */
export type IconTheme = 'light' | 'dark';

/** Icon MIME types */
export type IconMimeType = 'image/png' | 'image/jpeg' | 'image/jpg' | 'image/svg+xml' | 'image/webp';

/** Generic input configuration */
export interface Input {
   /** A list of possible values for the input */
   choices?: string[] | null;
   /** The default value for the input */
   default?: string;
   /** A description of the input */
   description?: string;
   /** Specifies the input format */
   format?: InputFormat;
   /** Whether the input is required */
   isRequired?: boolean;
   /** Indicates whether the input is a secret value */
   isSecret?: boolean;
   /** A placeholder for the input */
   placeholder?: string;
   /** The value for the input */
   value?: string;
}

/** Key-value input (for environment variables and headers) */
export interface KeyValueInput extends Input {
   /** Name of the header or environment variable */
   name: string;
   /** Variables for value templating */
   variables?: Record<string, Input>;
}

/** Argument configuration */
export interface Argument {
   /** Argument type: 'positional' or 'named' */
   type: string;
   /** A list of possible values for the input */
   choices?: string[] | null;
   /** The default value for the input */
   default?: string;
   /** A description of the input */
   description?: string;
   /** Specifies the input format */
   format?: InputFormat;
   /** Whether the argument can be repeated multiple times */
   isRepeated?: boolean;
   /** Whether the input is required */
   isRequired?: boolean;
   /** Indicates whether the input is a secret value */
   isSecret?: boolean;
   /** The flag name (for named arguments), including any leading dashes */
   name?: string;
   /** A placeholder for the input */
   placeholder?: string;
   /** The value for the input */
   value?: string;
   /** An identifier for positional arguments */
   valueHint?: string;
   /** A map of variable names to their values */
   variables?: Record<string, Input>;
}

/** Transport protocol configuration */
export interface Transport {
   /** Transport type (stdio, streamable-http, or sse) */
   type: TransportType;
   /** URL for streamable-http or sse transports */
   url?: string;
   /** HTTP headers for streamable-http or sse transports */
   headers?: KeyValueInput[] | null;
   /** Variables for URL templating in remote transports */
   variables?: Record<string, Input>;
}

/** Package configuration */
export interface Package {
   /** Registry type indicating how to download packages */
   registryType: RegistryType;
   /** Package identifier - either a package name or URL */
   identifier: string;
   /** Transport protocol configuration for the package */
   transport: Transport;
   /** Package version */
   version?: string;
   /** Base URL of the package registry */
   registryBaseUrl?: string;
   /** A mapping of environment variables to be set when running the package */
   environmentVariables?: KeyValueInput[] | null;
   /** SHA-256 hash of the package file for integrity verification */
   fileSha256?: string;
   /** A list of arguments to be passed to the package's binary */
   packageArguments?: Argument[] | null;
   /** A list of arguments to be passed to the package's runtime command */
   runtimeArguments?: Argument[] | null;
   /** A hint to help clients determine the appropriate runtime for the package */
   runtimeHint?: string;
}

/** Icon configuration */
export interface Icon {
   /** A standard URI pointing to an icon resource */
   src: string;
   /** Optional MIME type override */
   mimeType?: IconMimeType;
   /** Optional array of strings that specify sizes */
   sizes?: string[] | null;
   /** Optional specifier for the theme this icon is designed for */
   theme?: IconTheme;
}

/** Repository metadata */
export interface Repository {
   /** Repository URL for browsing source code */
   url?: string;
   /** Repository hosting service identifier */
   source?: string;
   /** Repository identifier from the hosting service */
   id?: string;
   /** Optional relative path from repository root to the server location */
   subfolder?: string;
}

/** Publisher-provided metadata */
export interface ServerMeta {
   'io.modelcontextprotocol.registry/publisher-provided'?: Record<string, unknown>;
}

/** Server JSON configuration */
export interface ServerJSON {
   /** JSON Schema URI for this server.json format */
   $schema: string;
   /** Server name in reverse-DNS format */
   name: string;
   /** Clear human-readable explanation of server functionality */
   description: string;
   /** Version string for this server */
   version: string;
   /** Optional human-readable title or display name */
   title?: string;
   /** Array of package configurations */
   packages?: Package[] | null;
   /** Array of remote configurations */
   remotes?: Transport[] | null;
   /** Optional repository metadata */
   repository?: Repository;
   /** Optional set of sized icons */
   icons?: Icon[] | null;
   /** Optional URL to the server's homepage */
   websiteUrl?: string;
   /** Extension metadata using reverse DNS namespacing */
   _meta?: ServerMeta;
}

/** Registry extensions metadata */
export interface RegistryExtensions {
   /** Server lifecycle status */
   status: ServerStatus;
   /** Timestamp when the server was first published */
   publishedAt: string;
   /** Whether this is the latest version of the server */
   isLatest: boolean;
   /** Timestamp when the server entry was last updated */
   updatedAt?: string;
}

/** Response metadata */
export interface ResponseMeta {
   'io.modelcontextprotocol.registry/official'?: RegistryExtensions;
}

/** Server response (server + metadata) */
export interface ServerResponse {
   /** Server configuration and metadata */
   server: ServerJSON;
   /** Registry-managed metadata */
   _meta: ResponseMeta;
}

/** Pagination metadata */
export interface PaginationMetadata {
   /** Number of items in current page */
   count: number;
   /** Pagination cursor for retrieving the next page */
   nextCursor?: string;
}

/** Server list response */
export interface ServerListResponse {
   /** List of server entries */
   servers: ServerResponse[] | null;
   /** Pagination metadata */
   metadata: PaginationMetadata;
}

/** API error detail */
export interface ErrorDetail {
   /** Where the error occurred */
   location?: string;
   /** Error message text */
   message?: string;
   /** The value at the given location */
   value?: unknown;
}

/** API error response */
export interface ErrorResponse {
   /** HTTP status code */
   status?: number;
   /** A short, human-readable summary of the problem type */
   title?: string;
   /** A human-readable explanation specific to this occurrence */
   detail?: string;
   /** A URI reference to human-readable documentation for the error */
   type?: string;
   /** A URI reference that identifies the specific occurrence */
   instance?: string;
   /** Optional list of individual error details */
   errors?: ErrorDetail[] | null;
}

/** Options for listing servers */
export interface ListServersOptions {
   /** Pagination cursor */
   cursor?: string;
   /** Number of items per page (1-100, default 30) */
   limit?: number;
   /** Filter servers updated since timestamp (RFC3339 datetime) */
   updatedSince?: string;
   /** Search servers by name (substring match) */
   search?: string;
   /** Filter by version ('latest' for latest version, or an exact version) */
   version?: string;
}

/** Options for getting a specific server version */
export interface GetServerOptions {
   /** Server version (use 'latest' for the latest version) */
   version?: string;
}
