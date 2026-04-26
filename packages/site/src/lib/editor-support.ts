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
   gemini: 'simple-icons:googlegemini',
   opencode: 'lucide:square-terminal',
};

export const managedEditorFeatures = editorFeatureDefinitions.filter((feature) => feature.kind === 'managed');
export const compatibilityEditorFeatures = editorFeatureDefinitions.filter(
   (feature) => feature.kind === 'compatibility',
);

export const featureConceptRoutes: Partial<Record<EditorFeatureId, string>> = Object.freeze({
   rules: '/concepts/rules/',
   prompts: '/concepts/prompts/',
   mcp: '/concepts/mcp-servers/',
   skills: '/concepts/skills/',
   hooks: '/concepts/hooks/',
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

export function formatEditorNameList(editors: readonly Pick<EditorSupportProfile, 'name'>[]): string {
   if (editors.length === 0) {
      return '';
   }
   if (editors.length === 1) {
      return editors[0].name;
   }
   if (editors.length === 2) {
      return `${editors[0].name} and ${editors[1].name}`;
   }

   const names = editors.map((editor) => editor.name);

   return `${names.slice(0, -1).join(', ')}, and ${names.at(-1)}`;
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

export function getEditorSupportDescription(scope: EditorScopeSupport): string | undefined {
   if (scope.editorNote) {
      return scope.editorNote;
   }

   return isEditorSupported(scope) ? undefined : 'The editor does not expose this feature at this scope.';
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

export function getMigrationHeadline(rows: readonly MigrationFeatureRow[]): string {
   const changed = rows.filter((row) => row.changeType !== 'same');

   if (changed.length === 0) {
      return 'The destination keeps the same high-level support surface.';
   }

   const changedFeatures = changed.slice(0, 3).map((row) => row.feature.label.toLowerCase());

   return `The biggest changes are in ${changedFeatures.join(', ')}.`;
}

export function getMigrationDescription(
   fromProfile: EditorSupportProfile,
   toProfile: EditorSupportProfile,
   rows: readonly MigrationFeatureRow[],
): string {
   const changedFeatures = rows
      .filter((row) => row.changeType !== 'same')
      .slice(0, 3)
      .map((row) => row.feature.label.toLowerCase());

   if (changedFeatures.length === 0) {
      return `Compare ${fromProfile.name} and ${toProfile.name} by terminology, editor support, aix support, and scope.`;
   }

   return `Compare ${fromProfile.name} to ${toProfile.name}, including ${changedFeatures.join(', ')} differences in terminology, support, and scope.`;
}

function describeEditorScope(
   editorName: string,
   scopeName: 'project' | 'user',
   scope: EditorScopeSupport,
): string {
   if (scope.status === 'unsupported') {
      const unsupportedMessage = `${editorName} has no ${scopeName}-scope target in aix.`;

      return scope.note ? `${unsupportedMessage} ${scope.note}` : unsupportedMessage;
   }

   const adapterText = scope.status === 'shim' ? ' through an aix adapter' : '',
         pathText = scope.path ? ` at ${scope.path}` : '',
         baseMessage = `${editorName} writes ${scopeName}-scope config${adapterText}${pathText}.`;

   return scope.note ? `${baseMessage} ${scope.note}` : baseMessage;
}

export function describeScopeChange(
   fromProfile: EditorSupportProfile,
   toProfile: EditorSupportProfile,
   row: MigrationFeatureRow,
): string {
   const parts: string[] = [];

   if (
      row.fromSupport.project.status !== row.toSupport.project.status ||
      row.fromSupport.project.path !== row.toSupport.project.path ||
      row.fromSupport.project.note !== row.toSupport.project.note
   ) {
      parts.push(
         `Project scope: ${describeEditorScope(fromProfile.name, 'project', row.fromSupport.project)} ${describeEditorScope(toProfile.name, 'project', row.toSupport.project)}`,
      );
   }

   if (
      row.fromSupport.user.status !== row.toSupport.user.status ||
      row.fromSupport.user.path !== row.toSupport.user.path ||
      row.fromSupport.user.note !== row.toSupport.user.note
   ) {
      parts.push(
         `User scope: ${describeEditorScope(fromProfile.name, 'user', row.fromSupport.user)} ${describeEditorScope(toProfile.name, 'user', row.toSupport.user)}`,
      );
   }

   return parts.join(' ');
}

export function describeTransition(
   fromProfile: EditorSupportProfile,
   toProfile: EditorSupportProfile,
   row: MigrationFeatureRow,
): string {
   if (row.changeType === 'gain') {
      return `${toProfile.name} keeps ${row.feature.label.toLowerCase()} more directly than ${fromProfile.name}.`;
   }
   if (row.changeType === 'tradeoff') {
      return `${toProfile.name} loses part of the ${row.feature.label.toLowerCase()} surface that ${fromProfile.name} has today.`;
   }
   if (row.terminologyChanged) {
      return `${fromProfile.name} calls this "${row.fromSupport.terminology}", while ${toProfile.name} calls it "${row.toSupport.terminology}".`;
   }
   if (row.scopeChanged) {
      return `${fromProfile.name} and ${toProfile.name} put ${row.feature.label.toLowerCase()} in different project or user targets.`;
   }

   return `${fromProfile.name} and ${toProfile.name} handle ${row.feature.label.toLowerCase()} the same way.`;
}

export function getEditorById(editor: SupportedEditorName): EditorSupportProfile {
   return getEditorSupportProfile(editor);
}

export function listMigrationPairs(): ReturnType<typeof listOrderedEditorPairs> {
   return listOrderedEditorPairs();
}

export function getFeatureAnchor(editor: SupportedEditorName, featureId: EditorFeatureId): string {
   return `${editor}-feature-${featureId}`;
}

export { editorFeatureDefinitions, editorSupportProfiles };
