import {
   editorFeatureDefinitions,
   editorSupportProfiles,
   getEditorSupportProfile,
   listOrderedEditorPairs,
   type EditorFeatureId,
   type EditorFeatureSupport,
   type EditorScopeSupport,
   type EditorSupportProfile,
   type EditorSupportStatus,
   type SupportedEditorName,
} from '@a1st/aix-schema';

export const editorIconNames: Record<SupportedEditorName, string> = {
   cursor: 'simple-icons:cursor',
   copilot: 'simple-icons:githubcopilot',
   'claude-code': 'simple-icons:anthropic',
   windsurf: 'simple-icons:codeium',
   zed: 'simple-icons:zedindustries',
   codex: 'simple-icons:openai',
   antigravity: 'simple-icons:googlegemini',
   opencode: 'lucide:square-terminal',
   grok: 'simple-icons:x',
};

export const managedEditorFeatures = editorFeatureDefinitions.filter((feature) => feature.kind === 'managed');

export const indexableMigrationPairs = [
   { from: 'cursor', to: 'claude-code' },
   { from: 'cursor', to: 'codex' },
   { from: 'claude-code', to: 'cursor' },
   { from: 'claude-code', to: 'codex' },
   { from: 'codex', to: 'cursor' },
   { from: 'codex', to: 'claude-code' },
] as const satisfies readonly { from: SupportedEditorName; to: SupportedEditorName }[];

export const featureConceptRoutes: Partial<Record<EditorFeatureId, string>> = Object.freeze({
   rules: '/concepts/rules/',
   prompts: '/concepts/prompts/',
   mcp: '/concepts/mcp-servers/',
   skills: '/concepts/skills/',
   agents: '/concepts/agents/',
   hooks: '/concepts/hooks/',
   plugins: '/concepts/plugins/',
   marketplaces: '/concepts/plugins/',
});

export interface MigrationFeatureRow {
   feature: (typeof editorFeatureDefinitions)[number];
   fromSupport: EditorFeatureSupport;
   toSupport: EditorFeatureSupport;
   changeType: 'same' | 'gain' | 'tradeoff' | 'difference';
   terminologyChanged: boolean;
   scopeChanged: boolean;
}

const supportRank: Record<EditorSupportStatus, number> = {
   unsupported: 0,
   shim: 1,
   native: 2,
};

const listFormatter = new Intl.ListFormat('en', { style: 'long', type: 'conjunction' });

/** Joins items as an English list: "a", "a and b", "a, b, and c". */
export function formatList(items: readonly string[]): string {
   return listFormatter.format(items);
}

export function formatEditorNameList(editors: readonly Pick<EditorSupportProfile, 'name'>[]): string {
   return formatList(editors.map((editor) => {
      return editor.name;
   }));
}

/**
 * The feature label as it reads mid-sentence. Plain words are lowercased ("Rules" becomes
 * "rules"); acronyms and file names such as "MCP" and "AGENTS.md" keep their casing.
 */
export function getFeatureProseLabel(feature: Pick<(typeof editorFeatureDefinitions)[number], 'label'>): string {
   return /^[A-Z][a-z]+$/u.test(feature.label) ? feature.label.toLowerCase() : feature.label;
}

export function getStatusLabel(status: EditorSupportStatus): string {
   const labels: Record<EditorSupportStatus, string> = {
      native: 'Native',
      shim: 'Adapter',
      unsupported: 'No support',
   };

   return labels[status];
}

export function getStatusDescription(status: EditorSupportStatus): string {
   const descriptions: Record<EditorSupportStatus, string> = {
      native: 'aix writes the editor-native format for this feature.',
      shim: 'aix preserves this feature through a compatible representation instead of the editor-native format.',
      unsupported: 'aix does not currently write this feature for the target editor.',
   };

   return descriptions[status];
}

export function isEditorSupported(scope: EditorScopeSupport): boolean {
   return scope.editorSupported ?? scope.status !== 'unsupported';
}

export function getAvailabilityLabel(supported: boolean): string {
   return supported ? 'Supported' : 'No support';
}

export function getAvailabilityDescription(supported: boolean): string {
   return supported
      ? 'The editor exposes this feature at this scope.'
      : 'The editor does not expose this feature at this scope.';
}

export function getEditorSupportDescription(scope: EditorScopeSupport): string | undefined {
   if (scope.editorNote) {
      return scope.editorNote;
   }

   return isEditorSupported(scope) ? undefined : getAvailabilityDescription(false);
}

export function getScopeTargets(scope: EditorScopeSupport): Array<{ label: string; path: string }> {
   const editorPath = scope.editorPath ?? scope.path;

   if (scope.editorPath && scope.path && scope.editorPath !== scope.path) {
      return [
         { label: 'Editor target', path: scope.editorPath },
         { label: 'aix target', path: scope.path },
      ];
   }

   if (scope.editorPath && !scope.path) {
      return [{ label: 'Editor target', path: scope.editorPath }];
   }

   if (editorPath) {
      return [{ label: 'Path', path: editorPath }];
   }

   return [];
}

export function getFeatureConceptRoute(featureId: EditorFeatureId): string | undefined {
   return featureConceptRoutes[featureId];
}

export function getEditorSupportRoute(editor: SupportedEditorName): string {
   return `/editors/${editor}/`;
}

export function getMigrationRoute(from: SupportedEditorName, to: SupportedEditorName): string {
   return `/editors/migrations/how-to-migrate-from-${from}-to-${to}/`;
}

export function isIndexableMigrationPair(from: SupportedEditorName, to: SupportedEditorName): boolean {
   return indexableMigrationPairs.some((pair) => pair.from === from && pair.to === to);
}

export function isIndexableMigrationSitemapURL(page: string): boolean {
   const route = new URL(page).pathname;

   if (!route.startsWith('/editors/migrations/how-to-migrate-from-')) {
      return true;
   }

   return indexableMigrationPairs.some((pair) => getMigrationRoute(pair.from, pair.to) === route);
}

export function getMigrationRows(
   fromEditor: SupportedEditorName,
   toEditor: SupportedEditorName,
): MigrationFeatureRow[] {
   const fromProfile = getEditorSupportProfile(fromEditor),
         toProfile = getEditorSupportProfile(toEditor);

   return editorFeatureDefinitions.map((feature) => {
      const fromSupport = fromProfile.features[feature.id],
            toSupport = toProfile.features[feature.id],
            fromRank = supportRank[fromSupport.summary],
            toRank = supportRank[toSupport.summary],
            terminologyChanged = fromSupport.terminology !== toSupport.terminology,
            scopeChanged =
               fromSupport.project.status !== toSupport.project.status ||
               isEditorSupported(fromSupport.project) !== isEditorSupported(toSupport.project) ||
               fromSupport.user.status !== toSupport.user.status ||
               isEditorSupported(fromSupport.user) !== isEditorSupported(toSupport.user) ||
               fromSupport.project.path !== toSupport.project.path ||
               fromSupport.user.path !== toSupport.user.path ||
               fromSupport.project.editorPath !== toSupport.project.editorPath ||
               fromSupport.user.editorPath !== toSupport.user.editorPath;

      let changeType: MigrationFeatureRow['changeType'] = 'same';

      if (toRank > fromRank) {
         changeType = 'gain';
      } else if (toRank < fromRank) {
         changeType = 'tradeoff';
      } else if (terminologyChanged || scopeChanged) {
         changeType = 'difference';
      }

      return {
         feature,
         fromSupport,
         toSupport,
         changeType,
         terminologyChanged,
         scopeChanged,
      };
   });
}

const LEADING_FEATURE_COUNT = 3;

function listLeadingFeatureLabels(rows: readonly MigrationFeatureRow[]): string[] {
   return rows.slice(0, LEADING_FEATURE_COUNT).map((row) => {
      return getFeatureProseLabel(row.feature);
   });
}

export function getMigrationHeadline(rows: readonly MigrationFeatureRow[]): string {
   const changed = rows.filter((row) => row.changeType !== 'same');

   if (changed.length === 0) {
      return 'aix supports the same features in the same way on both editors.';
   }

   return `The biggest changes are in ${formatList(listLeadingFeatureLabels(changed))}.`;
}

export function getMigrationTitle(
   fromProfile: Pick<EditorSupportProfile, 'name'>,
   toProfile: Pick<EditorSupportProfile, 'name'>,
): string {
   return `How to migrate from ${fromProfile.name} to ${toProfile.name}`;
}

export function getMigrationDescription(
   fromProfile: EditorSupportProfile,
   toProfile: EditorSupportProfile,
   rows: readonly MigrationFeatureRow[],
): string {
   const changedFeatures = listLeadingFeatureLabels(rows.filter((row) => {
      return row.changeType !== 'same';
   }));

   if (changedFeatures.length === 0) {
      return [
         `Migrate aix configuration from ${fromProfile.name} to ${toProfile.name}.`,
         'Compare feature support, project paths, and user paths before you sync.',
      ].join(' ');
   }

   return [
      `Migrate aix configuration from ${fromProfile.name} to ${toProfile.name}.`,
      `Preview ${formatList(changedFeatures)} differences before you sync.`,
   ].join(' ');
}

export function describeTransition(
   fromProfile: EditorSupportProfile,
   toProfile: EditorSupportProfile,
   row: MigrationFeatureRow,
): string {
   const featureLabel = getFeatureProseLabel(row.feature);

   if (row.changeType === 'gain') {
      return `${toProfile.name} keeps ${featureLabel} more directly than ${fromProfile.name}.`;
   }
   if (row.changeType === 'tradeoff') {
      return `${toProfile.name} loses part of the ${featureLabel} support that ${fromProfile.name} has today.`;
   }
   if (row.terminologyChanged) {
      return `${fromProfile.name} calls this "${row.fromSupport.terminology}", while ${toProfile.name} calls it "${row.toSupport.terminology}".`;
   }
   if (row.scopeChanged) {
      return `${fromProfile.name} and ${toProfile.name} put ${featureLabel} in different project or user targets.`;
   }

   return `${fromProfile.name} and ${toProfile.name} handle ${featureLabel} the same way.`;
}

const attentionOrder: Record<MigrationFeatureRow['changeType'], number> = {
   tradeoff: 0,
   gain: 1,
   difference: 2,
   same: 3,
};

/**
 * The rows that differ between the two editors, with the ones a reader most needs to know
 * about first: features the destination supports less well, then ones it supports better,
 * then ones that only change name or location.
 */
export function listChangedMigrationRows(rows: readonly MigrationFeatureRow[]): MigrationFeatureRow[] {
   return rows
      .filter((row) => {
         return row.changeType !== 'same';
      })
      .toSorted((left, right) => {
         return attentionOrder[left.changeType] - attentionOrder[right.changeType];
      });
}

export function getEditorById(editor: SupportedEditorName): EditorSupportProfile {
   return getEditorSupportProfile(editor);
}

export function listMigrationPairs(): ReturnType<typeof listOrderedEditorPairs> {
   return listOrderedEditorPairs();
}

/** Every migration pair that starts from or ends at the given editor, outgoing pairs first. */
export function listMigrationPairsForEditor(editor: SupportedEditorName): ReturnType<typeof listOrderedEditorPairs> {
   const pairs = listOrderedEditorPairs();

   return [
      ...pairs.filter((pair) => {
         return pair.from === editor;
      }),
      ...pairs.filter((pair) => {
         return pair.to === editor;
      }),
   ];
}

export function getFeatureAnchor(editor: SupportedEditorName, featureId: EditorFeatureId): string {
   return `${editor}-feature-${featureId}`;
}

export { editorFeatureDefinitions, editorSupportProfiles };
