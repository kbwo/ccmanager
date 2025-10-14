import React, {useState, useEffect} from 'react';
import {Box, Text} from 'ink';
import {supportsUnicode} from '../utils/terminalCapabilities.js';

interface LoadingSpinnerProps {
	message: string;
	spinnerType?: 'dots' | 'line';
	color?: 'cyan' | 'yellow' | 'green';
}

const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
	message,
	spinnerType,
	color = 'cyan',
}) => {
	const [frameIndex, setFrameIndex] = useState(0);

	// Unicode frames for "dots" spinner type
	const unicodeFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

	// ASCII frames for "line" spinner type (fallback for limited terminal support)
	const asciiFrames = ['-', '\\', '|', '/'];

	// Determine effective spinner type:
	// 1. If explicit spinnerType is provided, use it
	// 2. Otherwise, detect terminal capabilities automatically
	const effectiveSpinnerType =
		spinnerType !== undefined
			? spinnerType
			: supportsUnicode()
				? 'dots'
				: 'line';

	// Select frames based on effective spinner type
	const frames = effectiveSpinnerType === 'line' ? asciiFrames : unicodeFrames;

	useEffect(() => {
		// Set up animation interval - update frame every 120ms
		const interval = setInterval(() => {
			setFrameIndex(prevIndex => (prevIndex + 1) % frames.length);
		}, 120);

		// Cleanup interval on component unmount to prevent memory leaks
		return () => {
			clearInterval(interval);
		};
	}, [frames.length]);

	const currentFrame = frames[frameIndex];

	return (
		<Box flexDirection="row">
			<Text color={color}>{currentFrame} </Text>
			<Text>{message}</Text>
		</Box>
	);
};

export default LoadingSpinner;
