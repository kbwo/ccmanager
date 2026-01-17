import React, {createContext, useContext, useMemo} from 'react';
import {ConfigEditor} from '../services/configEditor.js';
import {ConfigScope} from '../types/index.js';

const ConfigEditorContext = createContext<ConfigEditor | null>(null);

interface ConfigEditorProviderProps {
	scope: ConfigScope;
	children: React.ReactNode;
}

/**
 * Provider component for ConfigEditor context.
 * Creates a ConfigEditor instance based on scope.
 * Uses singleton config editors to ensure config changes are
 * immediately visible to all components.
 */
export function ConfigEditorProvider({
	scope,
	children,
}: ConfigEditorProviderProps) {
	const configEditor = useMemo(() => new ConfigEditor(scope), [scope]);

	return (
		<ConfigEditorContext.Provider value={configEditor}>
			{children}
		</ConfigEditorContext.Provider>
	);
}

/**
 * Hook to access ConfigEditor from context.
 * Must be used within a ConfigEditorProvider.
 */
export function useConfigEditor(): ConfigEditor {
	const context = useContext(ConfigEditorContext);
	if (context === null) {
		throw new Error(
			'useConfigEditor must be used within a ConfigEditorProvider',
		);
	}
	return context;
}

export {ConfigEditorContext};
