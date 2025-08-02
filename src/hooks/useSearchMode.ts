import {useState, useEffect} from 'react';
import {useInput} from 'ink';

interface UseSearchModeOptions {
	onEscape?: () => void;
	onEnter?: () => void;
	skipInTest?: boolean;
	isDisabled?: boolean;
}

interface UseSearchModeReturn {
	isSearchMode: boolean;
	searchQuery: string;
	selectedIndex: number;
	setSearchQuery: (query: string) => void;
	setSelectedIndex: (index: number) => void;
}

export function useSearchMode(
	itemsLength: number,
	options: UseSearchModeOptions = {},
): UseSearchModeReturn {
	const [isSearchMode, setIsSearchMode] = useState(false);
	const [searchQuery, setSearchQuery] = useState('');
	const [selectedIndex, setSelectedIndex] = useState(0);

	const {onEscape, onEnter, skipInTest = true, isDisabled = false} = options;

	// Reset selected index when items change in search mode
	useEffect(() => {
		if (isSearchMode && selectedIndex >= itemsLength) {
			setSelectedIndex(Math.max(0, itemsLength - 1));
		}
	}, [itemsLength, isSearchMode, selectedIndex]);

	// Handle keyboard input
	useInput(
		(input, key) => {
			// Skip in test environment to avoid stdin.ref error
			if (skipInTest && !process.stdin.setRawMode) {
				return;
			}

			// Skip if disabled
			if (isDisabled) {
				return;
			}

			// Handle ESC key
			if (key.escape) {
				if (isSearchMode) {
					// Exit search mode but keep filter
					setIsSearchMode(false);
					onEscape?.();
				} else {
					// Clear filter when not in search mode
					setSearchQuery('');
				}
				return;
			}

			// Handle Enter key in search mode to exit search mode but keep filter
			if (key.return && isSearchMode) {
				setIsSearchMode(false);
				onEnter?.();
				return;
			}

			// Handle arrow keys in search mode for navigation
			if (isSearchMode) {
				if (key.upArrow && selectedIndex > 0) {
					setSelectedIndex(selectedIndex - 1);
				} else if (key.downArrow && selectedIndex < itemsLength - 1) {
					setSelectedIndex(selectedIndex + 1);
				}
				return;
			}

			// Handle "/" key to enter search mode
			if (input === '/') {
				setIsSearchMode(true);
				setSelectedIndex(0);
				return;
			}
		},
		{isActive: !isDisabled},
	);

	return {
		isSearchMode,
		searchQuery,
		selectedIndex,
		setSearchQuery,
		setSelectedIndex,
	};
}
