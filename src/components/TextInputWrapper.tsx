import React, {useState, useEffect, useRef} from 'react';
import {Text, useInput} from 'ink';
import stripAnsi from 'strip-ansi';

interface TextInputWrapperProps {
	value: string;
	onChange: (value: string) => void;
	onSubmit?: (value: string) => void;
	placeholder?: string;
	focus?: boolean;
	mask?: string;
	showCursor?: boolean;
	highlightPastedText?: boolean;
}

/**
 * Custom text input component that handles rapid input correctly.
 * This is a replacement for ink-text-input that uses refs for immediate
 * state updates, which is necessary for text expansion tools like Espanso.
 */
const TextInputWrapper: React.FC<TextInputWrapperProps> = ({
	value,
	onChange,
	onSubmit,
	placeholder = '',
	focus = true,
	mask,
	showCursor = true,
}) => {
	// Use ref to track the actual current value for immediate updates
	// This is critical for handling rapid input from tools like Espanso
	const valueRef = useRef(value);
	const cursorRef = useRef(value.length);

	// State for triggering re-renders
	const [, forceUpdate] = useState({});

	// Sync refs when value prop changes from parent
	useEffect(() => {
		valueRef.current = value;
		// Adjust cursor if it's beyond the new value length
		if (cursorRef.current > value.length) {
			cursorRef.current = value.length;
		}
	}, [value]);

	const cleanValue = (val: string): string => {
		let cleaned = stripAnsi(val);
		cleaned = cleaned.replace(/\[200~/g, '').replace(/\[201~/g, '');
		return cleaned;
	};

	// Process backspace characters that might be embedded in input string
	// This handles cases where text expansion tools send backspaces as characters
	const processBackspaces = (
		input: string,
		currentValue: string,
		cursor: number,
	): {value: string; cursor: number; remainingInput: string} => {
		let newValue = currentValue;
		let newCursor = cursor;
		let remaining = '';

		for (let i = 0; i < input.length; i++) {
			const char = input[i];
			const charCode = char?.charCodeAt(0);

			// Check for backspace characters (ASCII 8 or 127)
			if (charCode === 8 || charCode === 127) {
				if (newCursor > 0) {
					newValue =
						newValue.slice(0, newCursor - 1) + newValue.slice(newCursor);
					newCursor--;
				}
			} else {
				// Regular character - add to remaining
				remaining += char;
			}
		}

		return {value: newValue, cursor: newCursor, remainingInput: remaining};
	};

	useInput(
		(input, key) => {
			// Ignore certain keys
			if (
				key.upArrow ||
				key.downArrow ||
				(key.ctrl && input === 'c') ||
				key.tab ||
				(key.shift && key.tab)
			) {
				return;
			}

			// Handle Enter/Return
			if (key.return) {
				if (onSubmit) {
					onSubmit(valueRef.current);
				}
				return;
			}

			let currentValue = valueRef.current;
			let cursor = cursorRef.current;

			if (key.leftArrow) {
				if (showCursor && cursor > 0) {
					cursorRef.current = cursor - 1;
					forceUpdate({});
				}
				return;
			}

			if (key.rightArrow) {
				if (showCursor && cursor < currentValue.length) {
					cursorRef.current = cursor + 1;
					forceUpdate({});
				}
				return;
			}

			if (key.backspace || key.delete) {
				if (cursor > 0) {
					const nextValue =
						currentValue.slice(0, cursor - 1) + currentValue.slice(cursor);
					valueRef.current = nextValue;
					cursorRef.current = cursor - 1;
					onChange(nextValue);
					forceUpdate({});
				}
				return;
			}

			// Process input that might contain embedded backspace characters
			// (some text expansion tools send backspaces as part of the input string)
			const {
				value: processedValue,
				cursor: processedCursor,
				remainingInput,
			} = processBackspaces(input, currentValue, cursor);

			currentValue = processedValue;
			cursor = processedCursor;

			// Add remaining characters (non-backspace)
			if (remainingInput) {
				const cleanedInput = cleanValue(remainingInput);
				if (cleanedInput) {
					currentValue =
						currentValue.slice(0, cursor) +
						cleanedInput +
						currentValue.slice(cursor);
					cursor = cursor + cleanedInput.length;
				}
			}

			// Update refs immediately (synchronously)
			valueRef.current = currentValue;
			cursorRef.current = cursor;

			// Notify parent of value change
			onChange(currentValue);

			// Force re-render to update display
			forceUpdate({});
		},
		{isActive: focus},
	);

	// Render the text with cursor
	const displayValue = mask
		? mask.repeat(valueRef.current.length)
		: valueRef.current;
	const cursor = cursorRef.current;

	if (!showCursor || !focus) {
		return (
			<Text>
				{displayValue.length > 0 ? (
					displayValue
				) : placeholder ? (
					<Text dimColor>{placeholder}</Text>
				) : null}
			</Text>
		);
	}

	// Show cursor
	if (displayValue.length === 0) {
		// Show placeholder with cursor on first char
		if (placeholder) {
			return (
				<Text>
					<Text inverse>{placeholder[0] || ' '}</Text>
					<Text dimColor>{placeholder.slice(1)}</Text>
				</Text>
			);
		}
		return <Text inverse> </Text>;
	}

	// Render value with cursor
	const beforeCursor = displayValue.slice(0, cursor);
	const atCursor = displayValue[cursor] || ' ';
	const afterCursor = displayValue.slice(cursor + 1);

	return (
		<Text>
			{beforeCursor}
			<Text inverse>{atCursor}</Text>
			{afterCursor}
		</Text>
	);
};

export default TextInputWrapper;
