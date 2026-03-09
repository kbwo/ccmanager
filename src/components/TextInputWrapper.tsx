import React, {
	useReducer,
	useEffect,
	useRef,
	useMemo,
	type Reducer,
} from 'react';
import {Text, useInput} from 'ink';
import chalk from 'chalk';
import stripAnsi from 'strip-ansi';

interface TextInputWrapperProps {
	value: string;
	onChange: (value: string) => void;
	onSubmit?: (value: string) => void;
	placeholder?: string;
	focus?: boolean;
}

type State = {
	value: string;
	cursorOffset: number;
};

type Action =
	| {type: 'move-cursor-left'}
	| {type: 'move-cursor-right'}
	| {type: 'insert'; text: string}
	| {type: 'delete'}
	| {type: 'set'; value: string};

const reducer: Reducer<State, Action> = (state, action) => {
	switch (action.type) {
		case 'move-cursor-left': {
			return {
				...state,
				cursorOffset: Math.max(0, state.cursorOffset - 1),
			};
		}

		case 'move-cursor-right': {
			return {
				...state,
				cursorOffset: Math.min(state.value.length, state.cursorOffset + 1),
			};
		}

		case 'insert': {
			return {
				value:
					state.value.slice(0, state.cursorOffset) +
					action.text +
					state.value.slice(state.cursorOffset),
				cursorOffset: state.cursorOffset + action.text.length,
			};
		}

		case 'delete': {
			if (state.cursorOffset === 0) return state;
			const newOffset = state.cursorOffset - 1;
			return {
				value:
					state.value.slice(0, newOffset) + state.value.slice(newOffset + 1),
				cursorOffset: newOffset,
			};
		}

		case 'set': {
			return {
				value: action.value,
				cursorOffset: action.value.length,
			};
		}
	}
};

function cleanInput(input: string): string {
	let cleaned = stripAnsi(input);
	cleaned = cleaned.replace(/\[200~/g, '').replace(/\[201~/g, '');
	return cleaned;
}

const cursor = chalk.inverse(' ');

const TextInputWrapper: React.FC<TextInputWrapperProps> = ({
	value,
	onChange,
	onSubmit,
	placeholder = '',
	focus = true,
}) => {
	const [state, dispatch] = useReducer(reducer, {
		value,
		cursorOffset: value.length,
	});

	const lastReportedValue = useRef(value);

	// Sync external value changes into internal state
	useEffect(() => {
		if (value !== lastReportedValue.current) {
			lastReportedValue.current = value;
			dispatch({type: 'set', value});
		}
	}, [value]);

	// Report internal state changes to parent
	useEffect(() => {
		if (state.value !== lastReportedValue.current) {
			lastReportedValue.current = state.value;
			onChange(state.value);
		}
	}, [state.value, onChange]);

	useInput(
		(input, key) => {
			if (
				key.upArrow ||
				key.downArrow ||
				(key.ctrl && input === 'c') ||
				key.tab ||
				(key.shift && key.tab)
			) {
				return;
			}

			if (key.return) {
				onSubmit?.(state.value);
				return;
			}

			if (key.leftArrow) {
				dispatch({type: 'move-cursor-left'});
			} else if (key.rightArrow) {
				dispatch({type: 'move-cursor-right'});
			} else if (key.backspace || key.delete) {
				dispatch({type: 'delete'});
			} else {
				const cleaned = cleanInput(input);
				if (cleaned) {
					dispatch({type: 'insert', text: cleaned});
				}
			}
		},
		{isActive: focus},
	);

	const renderedPlaceholder = useMemo(() => {
		if (!focus) {
			return placeholder ? chalk.dim(placeholder) : '';
		}

		return placeholder.length > 0
			? chalk.inverse(placeholder[0]) + chalk.dim(placeholder.slice(1))
			: cursor;
	}, [focus, placeholder]);

	const renderedValue = useMemo(() => {
		if (!focus) {
			return state.value;
		}

		let result = state.value.length > 0 ? '' : cursor;

		let index = 0;
		for (const char of state.value) {
			result += index === state.cursorOffset ? chalk.inverse(char) : char;
			index++;
		}

		if (state.value.length > 0 && state.cursorOffset === state.value.length) {
			result += cursor;
		}

		return result;
	}, [focus, state.value, state.cursorOffset]);

	return (
		<Text>{state.value.length > 0 ? renderedValue : renderedPlaceholder}</Text>
	);
};

export default TextInputWrapper;
