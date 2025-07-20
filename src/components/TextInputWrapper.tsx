import React from 'react';
import TextInput from 'ink-text-input';
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

const TextInputWrapper: React.FC<TextInputWrapperProps> = ({
	value,
	onChange,
	...props
}) => {
	const handleChange = (newValue: string) => {
		// First strip all ANSI escape sequences
		let cleanedValue = stripAnsi(newValue);

		// Then specifically remove bracketed paste mode markers that might remain
		// These sometimes appear as literal text after ANSI stripping
		cleanedValue = cleanedValue.replace(/\[200~/g, '').replace(/\[201~/g, '');

		onChange(cleanedValue);
	};

	return <TextInput value={value} onChange={handleChange} {...props} />;
};

export default TextInputWrapper;
