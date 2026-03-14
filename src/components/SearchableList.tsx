import React from 'react';
import {Box, Text} from 'ink';
import TextInputWrapper from './TextInputWrapper.js';

interface ListItem {
	label: string;
	value: string;
}

interface SearchableListProps {
	isSearchMode: boolean;
	searchQuery: string;
	onSearchQueryChange: (query: string) => void;
	selectedIndex: number;
	items: ListItem[];
	limit: number;
	placeholder?: string;
	noMatchMessage?: string;
	children: React.ReactNode;
}

/**
 * Shared search mode UI: search input, filtered result list, and no-match message.
 * Wraps a SelectInput (passed as children) which is shown when not in search mode.
 */
const SearchableList: React.FC<SearchableListProps> = ({
	isSearchMode,
	searchQuery,
	onSearchQueryChange,
	selectedIndex,
	items,
	limit,
	placeholder = 'Type to filter...',
	noMatchMessage = 'No matches found',
	children,
}) => {
	if (!isSearchMode) {
		return <>{children}</>;
	}

	return (
		<>
			<Box marginBottom={1}>
				<Text>Search: </Text>
				<TextInputWrapper
					value={searchQuery}
					onChange={onSearchQueryChange}
					focus={true}
					placeholder={placeholder}
				/>
			</Box>

			{items.length === 0 ? (
				<Box>
					<Text color="yellow">{noMatchMessage}</Text>
				</Box>
			) : (
				<Box flexDirection="column">
					{items.slice(0, limit).map((item, index) => (
						<Text
							key={item.value}
							color={index === selectedIndex ? 'green' : undefined}
						>
							{index === selectedIndex ? '❯ ' : '  '}
							{item.label}
						</Text>
					))}
				</Box>
			)}
		</>
	);
};

export default SearchableList;
