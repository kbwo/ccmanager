# Repository Guidelines

## Project Structure & Module Organization
- `src/` holds all TypeScript sources; UI lives in `src/components/`, domain logic in `src/services/`, shared hooks in `src/hooks/`, and utilities/constants in their respective folders.  
- Tests sit beside the code they cover (e.g., `Menu.tsx` and `Menu.test.tsx`), enabling focused updates.  
- Built artifacts compile into `dist/`; keep changes out of version control.  
- Long-form notes and design references live under `docs/`; sync any behavior changes here when relevant.

## Build, Test & Development Commands
- `bun run dev` launches TypeScript in watch mode for rapid feedback.  
- `bun run build` produces release-ready output in `dist/`.  
- `bun run start` executes the compiled CLI (`dist/cli.js`) for manual smoke tests.  
- `bun run lint`, `bun run lint:fix`, and `bun run typecheck` enforce style and typing before review.  
- `bun run test` runs the Vitest suite once; combine with `bun run prepublishOnly` before publishing to exercise the full pipeline.

## Coding Style & Naming Conventions
- Follow the shared Prettier profile (`@vdemedes/prettier-config`); formatting issues surface as ESLint errors.  
- Use modern TypeScript/React patterns, avoiding `any` (rule enforced) and preferring explicit types for side-effectful functions.  
- Components and Effect-style services use PascalCase filenames; hooks start with `use`.  
- Keep TUI prompts and commands in `constants/` and `services/` rather than inline JSX.  
- Prefer dependency-free helpers in `utils/` so the CLI stays fast to load.
- use logger class instead of console. e.g. `logger.info("This is info level log");`

## Testing Guidelines
- Write Vitest unit tests alongside new files (`*.test.ts` or `*.test.tsx`); mirror the folder containing the behavior.  
- Use Ink Testing Library utilities for interactive components; stub terminal state as needed.  
- `bun run test` outputs coverage summaries (text, JSON, HTML under `coverage/`); maintain or improve coverage when changing core flows.  
- Name test suites after the component or service under test for easy grepping.

## Commit & Pull Request Guidelines
- Follow the existing Conventional Commit style (`type: subject`, e.g., `feat: add session filter`).  
- Squash cosmetic fixes locally; keep commit history signal-rich around behavior changes.  
- PRs should describe the user-visible impact, include reproduction or verification steps, and link related issues/docs.  
- Confirm `bun run lint`, `bun run typecheck`, and `bun run test` succeed before opening a PR; attach screenshots or terminal captures for TUI changes when helpful.
