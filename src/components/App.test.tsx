import React from 'react';
import {render} from 'ink-testing-library';
import {
	beforeAll,
	beforeEach,
	afterEach,
	describe,
	expect,
	it,
	vi,
} from 'vitest';
import {Effect} from 'effect';
import type {Effect as EffectType} from 'effect';
import type {
	Session as SessionType,
	Worktree,
	GitProject,
	DevcontainerConfig,
} from '../types/index.js';
import {ENV_VARS} from '../constants/env.js';

type AppComponent = typeof import('./App.js').default;

type MenuMockProps = {
	onSelectWorktree: (worktree: Worktree) => void | Promise<void>;
	onSelectRecentProject?: (project: GitProject) => void | Promise<void>;
};

type NewWorktreeMockProps = {
	onComplete: (request: {
		creationMode: 'manual' | 'prompt';
		path: string;
		branch?: string;
		baseBranch: string;
		copySessionData: boolean;
		copyClaudeDirectory: boolean;
		presetId?: string;
		initialPrompt?: string;
		projectPath?: string;
		autoDirectoryPattern?: string;
	}) => void | Promise<void>;
	onCancel: () => void | Promise<void>;
};

type DeleteWorktreeMockProps = {
	onComplete: (
		worktreePaths: string[],
		deleteBranch: boolean,
	) => void | Promise<void>;
	onCancel: () => void | Promise<void>;
};

type SessionMockProps = {
	session: SessionType;
	sessionManager: MockSessionManager;
	onReturnToMenu: () => void | Promise<void>;
};

type CreateWorktreeEffect = (
	path: string,
	branch: string,
	baseBranch: string,
	copySessionData: boolean,
	copyClaudeDirectory: boolean,
) => EffectType.Effect<Worktree, unknown, never>;

type DeleteWorktreeEffect = (
	worktreePath: string,
	options: {deleteBranch: boolean},
) => EffectType.Effect<void, unknown, never>;

let App: AppComponent;

let menuProps: MenuMockProps | undefined;
let newWorktreeProps: NewWorktreeMockProps | undefined;
let deleteWorktreeProps: DeleteWorktreeMockProps | undefined;
let sessionProps: SessionMockProps | undefined;

const createWorktreeEffectMock = vi.fn<CreateWorktreeEffect>();
const deleteWorktreeEffectMock = vi.fn<DeleteWorktreeEffect>();

const mockSession = {
	id: 'session-1',
} as unknown as SessionType;

class MockSessionManager {
	on = vi.fn((_: string, __: (...args: unknown[]) => void) => this);
	off = vi.fn((_: string, __: (...args: unknown[]) => void) => this);
	getSession = vi.fn((_: string) => null as SessionType | null);
	getAllSessions = vi.fn(() => [] as SessionType[]);
	createSessionWithPresetEffect = vi.fn((_: string, __?: string) =>
		Effect.succeed(mockSession),
	);
	createSessionWithDevcontainerEffect = vi.fn(
		(_: string, __?: Record<string, unknown>) => Effect.succeed(mockSession),
	);
}

const sessionManagers: MockSessionManager[] = [];

const getManagerForProjectMock = vi.fn((_: string | undefined) => {
	const manager = new MockSessionManager();
	sessionManagers.push(manager);
	return manager;
});

const configReaderMock = {
	getSelectPresetOnStart: vi.fn(() => false),
};

const projectManagerMock = {
	addRecentProject: vi.fn(),
};

const worktreeNameGeneratorMock = {
	generateBranchNameEffect: vi.fn(() => Effect.succeed('fix/trim-worktree-name')),
};

function createInkMock<TProps>(
	label: string,
	onRender?: (props: TProps) => void,
) {
	return async () => {
		const ReactActual = await vi.importActual<typeof import('react')>('react');
		const {Text} = await vi.importActual<typeof import('ink')>('ink');

		const Component = (props: TProps) => {
			onRender?.(props);
			return ReactActual.createElement(Text, null, label);
		};

		return {
			__esModule: true,
			default: Component,
		};
	};
}

vi.mock('../services/sessionManager.js', () => ({
	SessionManager: MockSessionManager,
}));

vi.mock('../services/globalSessionOrchestrator.js', () => ({
	globalSessionOrchestrator: {
		getManagerForProject: getManagerForProjectMock,
		destroyAllSessions: vi.fn(),
	},
}));

vi.mock('../services/projectManager.js', () => ({
	projectManager: projectManagerMock,
}));

vi.mock('../services/config/configReader.js', () => ({
	configReader: configReaderMock,
}));

vi.mock('../services/worktreeNameGenerator.js', () => ({
	worktreeNameGenerator: worktreeNameGeneratorMock,
}));

vi.mock('../services/worktreeService.js', () => ({
	WorktreeService: vi.fn(function () {
		return {
			createWorktreeEffect: (...args: Parameters<CreateWorktreeEffect>) =>
				createWorktreeEffectMock(...args),
			deleteWorktreeEffect: (...args: Parameters<DeleteWorktreeEffect>) =>
				deleteWorktreeEffectMock(...args),
		};
	}),
}));

vi.mock(
	'./Menu.js',
	createInkMock<MenuMockProps>('Menu View', props => (menuProps = props)),
);
vi.mock(
	'./ProjectList.js',
	createInkMock('Project List View', () => {}),
);
vi.mock(
	'./NewWorktree.js',
	createInkMock<NewWorktreeMockProps>('New Worktree View', props => {
		newWorktreeProps = props;
	}),
);
vi.mock(
	'./DeleteWorktree.js',
	createInkMock<DeleteWorktreeMockProps>('Delete Worktree View', props => {
		deleteWorktreeProps = props;
	}),
);
vi.mock(
	'./Session.js',
	createInkMock<SessionMockProps>('Session View', props => {
		sessionProps = props;
	}),
);
vi.mock('./MergeWorktree.js', createInkMock('Merge Worktree View'));
vi.mock('./Configuration.js', createInkMock('Configuration View'));
vi.mock('./PresetSelector.js', createInkMock('Preset Selector View'));
vi.mock(
	'./RemoteBranchSelector.js',
	createInkMock('Remote Branch Selector View'),
);

vi.mock('./LoadingSpinner.js', async () => {
	const ReactActual = await vi.importActual<typeof import('react')>('react');
	const {Text} = await vi.importActual<typeof import('ink')>('ink');

	const Component = ({message, color}: {message: string; color: string}) => {
		return ReactActual.createElement(Text, null, `${message} [${color}]`);
	};

	return {
		__esModule: true,
		default: Component,
	};
});

beforeAll(async () => {
	App = (await import('./App.js')).default;
});

const flush = (ms = 0) => new Promise(resolve => setTimeout(resolve, ms));

const waitForCondition = async (
	condition: () => boolean,
	timeout = 200,
	interval = 5,
) => {
	const deadline = Date.now() + timeout;
	while (!condition()) {
		if (Date.now() > deadline) {
			throw new Error('Timed out waiting for condition');
		}
		await flush(interval);
	}
};

beforeEach(() => {
	menuProps = undefined;
	newWorktreeProps = undefined;
	deleteWorktreeProps = undefined;
	sessionProps = undefined;
	createWorktreeEffectMock.mockReset();
	deleteWorktreeEffectMock.mockReset();
	createWorktreeEffectMock.mockImplementation((path, branch) =>
		Effect.succeed({
			path,
			branch,
			isMainWorktree: false,
			hasSession: false,
		} as Worktree),
	);
	deleteWorktreeEffectMock.mockImplementation(() => Effect.succeed(undefined));
	sessionManagers.length = 0;
	getManagerForProjectMock.mockClear();
	configReaderMock.getSelectPresetOnStart.mockReset();
	configReaderMock.getSelectPresetOnStart.mockReturnValue(false);
	projectManagerMock.addRecentProject.mockReset();
	worktreeNameGeneratorMock.generateBranchNameEffect.mockReset();
	worktreeNameGeneratorMock.generateBranchNameEffect.mockImplementation(() =>
		Effect.succeed('fix/trim-worktree-name'),
	);
});

afterEach(() => {
	delete process.env[ENV_VARS.MULTI_PROJECT_ROOT];
});

describe('App component view state', () => {
	it('renders the menu view by default', async () => {
		const {lastFrame, unmount} = render(<App version="test" />);
		await flush(40);

		expect(lastFrame()).toContain('Menu View');

		unmount();
	});

	it('renders the project list view first in multi-project mode', async () => {
		const original = process.env[ENV_VARS.MULTI_PROJECT_ROOT];
		process.env[ENV_VARS.MULTI_PROJECT_ROOT] = '/tmp/projects';

		const {lastFrame, unmount} = render(<App multiProject version="test" />);
		await flush();

		expect(lastFrame()).toContain('Project List View');

		unmount();

		if (original !== undefined) {
			process.env[ENV_VARS.MULTI_PROJECT_ROOT] = original;
		}
	});
});

describe('App component loading state machine', () => {
	it('displays copying message while creating a worktree with session data', async () => {
		let resolveWorktree: (() => void) | undefined;

		createWorktreeEffectMock.mockImplementation(() =>
			Effect.tryPromise({
				try: () =>
					new Promise<Worktree>(resolve => {
						resolveWorktree = () =>
							resolve({
								path: '/tmp/test',
								branch: 'feature',
								isMainWorktree: false,
								hasSession: false,
							} as Worktree);
					}),
				catch: (error: unknown) => error as never,
			}),
		);

		const {lastFrame, unmount} = render(<App version="test" />);
		await waitForCondition(() => Boolean(menuProps));

		const menu = menuProps!;
		const selectPromise = Promise.resolve(
			menu.onSelectWorktree({
				path: '',
				branch: '',
				isMainWorktree: false,
				hasSession: false,
			}),
		);
		await waitForCondition(() => Boolean(newWorktreeProps));

		const newWorktree = newWorktreeProps!;
		const createPromise = Promise.resolve(
			newWorktree.onComplete({
				creationMode: 'manual',
				path: '/tmp/test',
				branch: 'feature',
				baseBranch: 'main',
				copySessionData: true,
				copyClaudeDirectory: false,
			}),
		);
		await flush();

		expect(lastFrame()).toContain(
			'Creating worktree and copying session data...',
		);

		resolveWorktree?.();
		await createPromise;
		await selectPromise;
		await waitForCondition(() => lastFrame()?.includes('Menu View') ?? false);

		expect(lastFrame()).toContain('Menu View');

		unmount();
	});

	it('auto-starts the prompt-first session with the created worktree path', async () => {
		const {lastFrame, unmount} = render(<App version="test" />);
		await waitForCondition(() => Boolean(menuProps));
		expect(sessionManagers).toHaveLength(1);

		const sessionManager = sessionManagers[0]!;
		const menu = menuProps!;
		await Promise.resolve(
			menu.onSelectWorktree({
				path: '',
				branch: '',
				isMainWorktree: false,
				hasSession: false,
			}),
		);
		await waitForCondition(() => Boolean(newWorktreeProps));

		await Promise.resolve(
			newWorktreeProps!.onComplete({
				creationMode: 'prompt',
				path: '/tmp/project',
				projectPath: '/tmp/project',
				autoDirectoryPattern: '../{branch}',
				baseBranch: 'main',
				presetId: 'claude',
				initialPrompt: 'trim worktree name output',
				copySessionData: false,
				copyClaudeDirectory: false,
			}),
		);

		const createdPath = createWorktreeEffectMock.mock.calls[0]?.[0] as string;

		await waitForCondition(
			() => sessionManager.createSessionWithPresetEffect.mock.calls.length > 0,
			200,
		);
		await waitForCondition(() => lastFrame()?.includes('Session View') ?? false);

		expect(sessionManager.createSessionWithPresetEffect).toHaveBeenCalledWith(
			createdPath,
			'claude',
			'trim worktree name output',
		);
		expect(sessionProps?.session).toEqual(mockSession);

		unmount();
	});

	it('uses the created worktree path when auto-starting a prompt-first session', async () => {
		createWorktreeEffectMock.mockImplementation((_path, branch) =>
			Effect.succeed({
				path: '/tmp/resolved-worktree',
				branch,
				isMainWorktree: false,
				hasSession: false,
			} as Worktree),
		);

		const {unmount} = render(<App version="test" />);
		await waitForCondition(() => Boolean(menuProps));
		const sessionManager = sessionManagers[0]!;

		await Promise.resolve(
			menuProps!.onSelectWorktree({
				path: '',
				branch: '',
				isMainWorktree: false,
				hasSession: false,
			}),
		);
		await waitForCondition(() => Boolean(newWorktreeProps));

		await Promise.resolve(
			newWorktreeProps!.onComplete({
				creationMode: 'prompt',
				path: '../relative-worktree',
				projectPath: '/tmp/project',
				autoDirectoryPattern: '../{branch}',
				baseBranch: 'main',
				presetId: 'claude',
				initialPrompt: 'trim worktree name output',
				copySessionData: false,
				copyClaudeDirectory: false,
			}),
		);

		await waitForCondition(
			() => sessionManager.createSessionWithPresetEffect.mock.calls.length > 0,
			200,
		);

		expect(sessionManager.createSessionWithPresetEffect).toHaveBeenCalledWith(
			'/tmp/resolved-worktree',
			'claude',
			'trim worktree name output',
		);

		unmount();
	});

	it('displays branch deletion message while deleting worktrees', async () => {
		let resolveDelete: (() => void) | undefined;

		deleteWorktreeEffectMock.mockImplementation(() =>
			Effect.tryPromise({
				try: () =>
					new Promise<void>(resolve => {
						resolveDelete = resolve;
					}),
				catch: (error: unknown) => error as never,
			}),
		);

		const {lastFrame, unmount} = render(<App version="test" />);
		await waitForCondition(() => Boolean(menuProps));

		const menu = menuProps!;
		const selectPromise = Promise.resolve(
			menu.onSelectWorktree({
				path: 'DELETE_WORKTREE',
				branch: '',
				isMainWorktree: false,
				hasSession: false,
			}),
		);
		await waitForCondition(() => Boolean(deleteWorktreeProps));

		const deleteWorktree = deleteWorktreeProps!;
		const deletePromise = Promise.resolve(
			deleteWorktree.onComplete(['/tmp/test'], true),
		);
		await flush();

		expect(lastFrame()).toContain('Deleting worktrees and branches...');

		resolveDelete?.();
		await deletePromise;
		await selectPromise;
		await waitForCondition(() => lastFrame()?.includes('Menu View') ?? false);

		expect(lastFrame()).toContain('Menu View');

		unmount();
	});

	it('shows devcontainer spinner while creating a session with config', async () => {
		let resolveSession: ((session: typeof mockSession) => void) | undefined;

		const {lastFrame, unmount} = render(
			<App
				version="test"
				devcontainerConfig={
					{
						upCommand: 'podman up',
						execCommand: 'podman exec',
					} satisfies DevcontainerConfig
				}
			/>,
		);
		await waitForCondition(() => Boolean(menuProps));

		expect(menuProps).toBeDefined();
		expect(sessionManagers).toHaveLength(1);

		const sessionManager = sessionManagers[0]!;

		sessionManager.createSessionWithDevcontainerEffect.mockImplementation(() =>
			Effect.tryPromise({
				try: () =>
					new Promise(resolve => {
						resolveSession = resolve;
					}),
				catch: (error: unknown) => error as never,
			}),
		);

		const menu = menuProps!;
		const selectPromise = Promise.resolve(
			menu.onSelectWorktree({
				path: '/project/worktree',
				branch: 'feature',
				isMainWorktree: false,
				hasSession: false,
			}),
		);
		await flush();

		expect(lastFrame()).toContain(
			'Starting devcontainer (this may take a moment)...',
		);

		resolveSession?.(mockSession);
		await selectPromise;
		await flush(20);

		expect(lastFrame()).toContain('Session View');
		expect(sessionProps?.session).toEqual(mockSession);

		unmount();
	});
});
