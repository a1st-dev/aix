import {
   editorFeatureDefinitions,
   editorSupportProfiles,
   getEditorSupportProfile,
   listOrderedEditorPairs,
   type EditorFeatureId,
   type EditorFeatureSupport,
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
      unsupported: 'Unsupported',
   };

   return labels[status];
}

export function getStatusSymbol(status: EditorSupportStatus): string {
   const symbols: Record<EditorSupportStatus, string> = {
      native: 'OK',
      shim: 'Shim',
      unsupported: 'No',
   };

   return symbols[status];
}

export function describeScopeSupport(scope: EditorFeatureSupport['project']): string {
   const parts = [ getStatusLabel(scope.status) ];

   if (scope.path) {
      parts.push(scope.path);
   }
   if (scope.note) {
      parts.push(scope.note);
   }

   return parts.join(' - ');
}

export function getMigrationRoute(from: SupportedEditorName, to: SupportedEditorName): string {
   return `/editors/migrations/${from}-to-${to}/`;
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
               fromSupport.user.status !== toSupport.user.status ||
               fromSupport.project.path !== toSupport.project.path ||
               fromSupport.user.path !== toSupport.user.path;

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
      return `Compare ${fromProfile.name} and ${toProfile.name} support in aix across project and user scope.`;
   }

   return `Compare ${fromProfile.name} to ${toProfile.name} in aix, including ${changedFeatures.join(', ')} differences by scope.`;
}

export function describeTransition(
   fromProfile: EditorSupportProfile,
   toProfile: EditorSupportProfile,
   row: MigrationFeatureRow,
): string {
   if (row.changeType === 'gain') {
      return `${toProfile.name} has stronger ${row.feature.label.toLowerCase()} support than ${fromProfile.name}.`;
   }
   if (row.changeType === 'tradeoff') {
      return `${toProfile.name} drops part of the ${row.feature.label.toLowerCase()} support that ${fromProfile.name} has.`;
   }
   if (row.terminologyChanged) {
      return `${fromProfile.name} calls this "${row.fromSupport.terminology}", while ${toProfile.name} calls it "${row.toSupport.terminology}".`;
   }
   if (row.scopeChanged) {
      return `${fromProfile.name} and ${toProfile.name} differ by project or user scope for ${row.feature.label.toLowerCase()}.`;
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
   return `${editor}-${featureId}`;
}

export { editorFeatureDefinitions, editorSupportProfiles };
