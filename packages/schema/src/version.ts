export const SCHEMA_VERSION = '1',
             SCHEMA_VERSION_FULL = '1.0.0',
             SCHEMA_BASE_URL = 'https://x.a1st.dev/schemas';

export function getSchemaUrl(version: string = SCHEMA_VERSION): string {
   return `${SCHEMA_BASE_URL}/v${version}/ai.json`;
}
