{
  description = "CCManager development environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils, ... }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = nixpkgs.legacyPackages.${system};

        # Build the CCManager package
        ccmanager = pkgs.buildNpmPackage {
          pname = "ccmanager";
          version = "0.1.5";

          src = self;

          npmDepsHash = "sha256-8M1AG++Kb90sCe2Qc2lXmWejH4nhzE+GIOzaNkTSnOU=";

          nativeBuildInputs = with pkgs; [
            python3
            pkg-config
          ] ++ lib.optionals stdenv.isLinux [
            glibc.dev
          ] ++ lib.optionals stdenv.isDarwin [
            darwin.apple_sdk.frameworks.CoreServices
            darwin.apple_sdk.frameworks.Security
          ];

          buildInputs = with pkgs; [
            stdenv.cc.cc.lib
          ];

          # Set environment variables for native compilation
          PYTHON = "${pkgs.python3}/bin/python";

          meta = with pkgs.lib; {
            description = "TUI application for managing multiple Claude Code sessions across Git worktrees";
            homepage = "https://github.com/kbwo/ccmanager";
            license = licenses.mit;
            maintainers = [];
            platforms = platforms.all;
            mainProgram = "ccmanager";
          };
        };
      in
      {
        packages = {
          default = ccmanager;
          inherit ccmanager;
        };

        devShells.default = pkgs.mkShell {
          name = "ccmanager-dev";

          nativeBuildInputs = with pkgs; [
						# Nix Lsp and Formatters
					nixd
					alejandra
            # Node.js runtime and package manager
            nodejs_20

            # Development tools
            typescript
            nodePackages.typescript-language-server
            nodePackages.prettier
            nodePackages.eslint

            # Git for worktree operations
            git

            # Native build tools for node-pty and other native modules
            python3
            pkg-config
          ];

          buildInputs = with pkgs; [
            # C/C++ development environment for native modules
            stdenv.cc.cc.lib
          ] ++ lib.optionals stdenv.isLinux [
            # Linux-specific development libraries
            glibc.dev
          ] ++ lib.optionals stdenv.isDarwin [
            # macOS-specific frameworks
            darwin.apple_sdk.frameworks.CoreServices
            darwin.apple_sdk.frameworks.Security
          ];

          shellHook = ''
            echo "🚀 CCManager development environment"
            echo "Node.js version: $(node --version)"
            echo "npm version: $(npm --version)"
            echo ""
            echo "Available commands:"
            echo "  npm install     - Install dependencies"
            echo "  npm run dev     - Start development with watch mode"
            echo "  npm run build   - Build the project"
            echo "  npm test        - Run tests"
            echo "  npm run lint    - Run linting"
            echo "  npm start       - Run the built application"
            echo ""
          '';

          # Environment variables
          NODE_ENV = "development";
          PYTHON = "${pkgs.python3}/bin/python";
        };

        # Convenience aliases for common commands
        apps = {
          dev = flake-utils.lib.mkApp {
            drv = pkgs.writeShellScriptBin "ccmanager-dev" ''
              npm run dev
            '';
          };

          build = flake-utils.lib.mkApp {
            drv = pkgs.writeShellScriptBin "ccmanager-build" ''
              npm run build
            '';
          };

          test = flake-utils.lib.mkApp {
            drv = pkgs.writeShellScriptBin "ccmanager-test" ''
              npm test
            '';
          };

          start = flake-utils.lib.mkApp {
            drv = pkgs.writeShellScriptBin "ccmanager-start" ''
              npm start
            '';
          };
        };
      });
}
