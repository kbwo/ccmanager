import {describe, it, expect, beforeEach, vi} from 'vitest';
import {SessionManager} from './sessionManager.js';
import {SessionState} from '../types/index.js';

// Mock the promptDetector module
vi.mock('../utils/promptDetector.js', () => ({
	includesPromptBoxBottomBorder: vi.fn(),
}));

import {includesPromptBoxBottomBorder} from '../utils/promptDetector.js';

describe('SessionManager', () => {
	let sessionManager: SessionManager;
	const mockSessionId = 'test-session-123';

	beforeEach(() => {
		sessionManager = new SessionManager();
		vi.clearAllMocks();
	});

	describe('detectSessionState', () => {
		it('should detect waiting_input state when "Do you want" prompt is present', () => {
			const cleanData = '│ Do you want to continue?';
			const currentState: SessionState = 'idle';
			vi.mocked(includesPromptBoxBottomBorder).mockReturnValue(false);

			const newState = sessionManager.detectSessionState(
				cleanData,
				currentState,
				mockSessionId,
			);

			expect(newState).toBe('waiting_input');
		});

		it('should set waitingWithBottomBorder when waiting prompt and bottom border are both present', () => {
			const cleanData = '│ Do you want to continue?\n└───────────────────────┘';
			const currentState: SessionState = 'idle';
			vi.mocked(includesPromptBoxBottomBorder).mockReturnValue(true);

			const newState = sessionManager.detectSessionState(
				cleanData,
				currentState,
				mockSessionId,
			);

			expect(newState).toBe('waiting_input');
			// The internal map should have been set to true
		});

		it('should maintain waiting_input state when bottom border appears after waiting prompt', () => {
			const cleanData = '└───────────────────────┘';
			const currentState: SessionState = 'waiting_input';
			vi.mocked(includesPromptBoxBottomBorder).mockReturnValue(true);

			// First call to set up the waiting state without bottom border
			vi.mocked(includesPromptBoxBottomBorder).mockReturnValue(false);
			sessionManager.detectSessionState(
				'│ Do you want to continue?',
				'idle',
				mockSessionId,
			);

			// Now test the bottom border appearing
			vi.mocked(includesPromptBoxBottomBorder).mockReturnValue(true);
			const newState = sessionManager.detectSessionState(
				cleanData,
				currentState,
				mockSessionId,
			);

			expect(newState).toBe('waiting_input');
		});

		it('should detect busy state when "esc to interrupt" is present', () => {
			const cleanData = 'Processing... Press ESC to interrupt';
			const currentState: SessionState = 'idle';
			vi.mocked(includesPromptBoxBottomBorder).mockReturnValue(false);

			const newState = sessionManager.detectSessionState(
				cleanData,
				currentState,
				mockSessionId,
			);

			expect(newState).toBe('busy');
		});

		it('should maintain busy state when transitioning from busy without "esc to interrupt"', () => {
			const cleanData = 'Some regular output text';
			const currentState: SessionState = 'busy';
			vi.mocked(includesPromptBoxBottomBorder).mockReturnValue(false);

			const newState = sessionManager.detectSessionState(
				cleanData,
				currentState,
				mockSessionId,
			);

			// With the new logic, it should remain busy and start a timer
			expect(newState).toBe('busy');
		});

		it('should handle case-insensitive "esc to interrupt" detection', () => {
			const cleanData = 'Running task... PRESS ESC TO INTERRUPT';
			const currentState: SessionState = 'idle';
			vi.mocked(includesPromptBoxBottomBorder).mockReturnValue(false);

			const newState = sessionManager.detectSessionState(
				cleanData,
				currentState,
				mockSessionId,
			);

			expect(newState).toBe('busy');
		});

		it('should not change from waiting_input when bottom border was already seen', () => {
			const cleanData = '└───────────────────────┘';
			const currentState: SessionState = 'waiting_input';
			vi.mocked(includesPromptBoxBottomBorder).mockReturnValue(true);

			// First, simulate seeing waiting prompt with bottom border
			sessionManager.detectSessionState(
				'│ Do you want to continue?\n└───────────────────────┘',
				'idle',
				mockSessionId,
			);

			// Now another bottom border appears
			const newState = sessionManager.detectSessionState(
				cleanData,
				currentState,
				mockSessionId,
			);

			expect(newState).toBe('idle'); // Should change to idle since we already saw the bottom border
		});

		it('should clear waitingWithBottomBorder flag when transitioning to busy', () => {
			const cleanData = 'Processing... Press ESC to interrupt';
			const currentState: SessionState = 'waiting_input';
			vi.mocked(includesPromptBoxBottomBorder).mockReturnValue(false);

			// First set up waiting state with bottom border
			vi.mocked(includesPromptBoxBottomBorder).mockReturnValue(true);
			sessionManager.detectSessionState(
				'│ Do you want to continue?\n└───────────────────────┘',
				'idle',
				mockSessionId,
			);

			// Now transition to busy
			vi.mocked(includesPromptBoxBottomBorder).mockReturnValue(false);
			const newState = sessionManager.detectSessionState(
				cleanData,
				currentState,
				mockSessionId,
			);

			expect(newState).toBe('busy');
		});

		it('should clear waitingWithBottomBorder flag when transitioning to idle', () => {
			const cleanData = 'Task completed successfully';
			const currentState: SessionState = 'waiting_input';
			vi.mocked(includesPromptBoxBottomBorder).mockReturnValue(false);

			// First set up waiting state with bottom border
			vi.mocked(includesPromptBoxBottomBorder).mockReturnValue(true);
			sessionManager.detectSessionState(
				'│ Do you want to continue?\n└───────────────────────┘',
				'idle',
				mockSessionId,
			);

			// Now transition to idle
			vi.mocked(includesPromptBoxBottomBorder).mockReturnValue(false);
			const newState = sessionManager.detectSessionState(
				cleanData,
				currentState,
				mockSessionId,
			);

			expect(newState).toBe('idle');
		});

		it('should transition from busy to idle after 500ms timer when no "esc to interrupt"', async () => {
			// Create a mock session for the timer test
			const mockWorktreePath = '/test/worktree';
			const mockSession = {
				id: mockSessionId,
				worktreePath: mockWorktreePath,
				state: 'busy' as SessionState,
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				process: {} as any,
				output: [],
				outputHistory: [],
				lastActivity: new Date(),
				isActive: false,
			};

			// Add the session to the manager
			sessionManager.sessions.set(mockWorktreePath, mockSession);

			// Mock the EventEmitter emit method
			const emitSpy = vi.spyOn(sessionManager, 'emit');

			// First call with no esc to interrupt should maintain busy state
			const cleanData = 'Some regular output text';
			vi.mocked(includesPromptBoxBottomBorder).mockReturnValue(false);

			const newState = sessionManager.detectSessionState(
				cleanData,
				'busy',
				mockWorktreePath,
			);

			expect(newState).toBe('busy');

			// Wait for timer to fire (500ms + buffer)
			await new Promise(resolve => setTimeout(resolve, 600));

			// Check that the session state was changed to idle
			expect(mockSession.state).toBe('idle');
			expect(emitSpy).toHaveBeenCalledWith('sessionStateChanged', mockSession);
		});

		it('should cancel timer when "esc to interrupt" appears again', async () => {
			// Create a mock session for the timer test
			const mockWorktreePath = '/test/worktree';
			const mockSession = {
				id: mockSessionId,
				worktreePath: mockWorktreePath,
				state: 'busy' as SessionState,
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				process: {} as any,
				output: [],
				outputHistory: [],
				lastActivity: new Date(),
				isActive: false,
			};

			// Add the session to the manager
			sessionManager.sessions.set(mockWorktreePath, mockSession);

			// First call with no esc to interrupt should maintain busy state and start timer
			const cleanData1 = 'Some regular output text';
			vi.mocked(includesPromptBoxBottomBorder).mockReturnValue(false);

			const newState1 = sessionManager.detectSessionState(
				cleanData1,
				'busy',
				mockWorktreePath,
			);

			expect(newState1).toBe('busy');

			// Wait 200ms (less than timer duration)
			await new Promise(resolve => setTimeout(resolve, 200));

			// Second call with esc to interrupt should cancel timer and keep busy
			const cleanData2 = 'Running... Press ESC to interrupt';
			const newState2 = sessionManager.detectSessionState(
				cleanData2,
				'busy',
				mockWorktreePath,
			);

			expect(newState2).toBe('busy');

			// Wait another 400ms (total 600ms, more than timer duration)
			await new Promise(resolve => setTimeout(resolve, 400));

			// State should still be busy because timer was cancelled
			expect(mockSession.state).toBe('busy');
		});
	});
});
