import React, {useState, useEffect} from 'react';
import {Box, Text} from 'ink';

interface LoadingSpinnerProps {
	message: string;
	spinnerType?: 'dots' | 'line';
	color?: 'cyan' | 'yellow' | 'green';
}

const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
	message,
	spinnerType = 'dots',
	color = 'cyan',
}) => {
	const [frameIndex, setFrameIndex] = useState(0);

	// Unicode frames for "dots" spinner type
	const unicodeFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

	// ASCII frames for "line" spinner type (fallback for limited terminal support)
	const asciiFrames = ['-', '\\', '|', '/'];

	// Select frames based on spinner type
	const frames = spinnerType === 'line' ? asciiFrames : unicodeFrames;

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
