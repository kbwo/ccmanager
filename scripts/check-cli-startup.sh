#!/bin/bash

if [ -z "$1" ]; then
  echo "Usage: $0 <command>"
  exit 1
fi

# Start CLI in background and capture output
timeout 5s $1 > /tmp/cli-stdout.log 2> /tmp/cli-stderr.log || EXIT_CODE=$?

# Check for early exit (exit code other than timeout's 124)
if [ ! -z "$EXIT_CODE" ] && [ "$EXIT_CODE" != "124" ]; then
  echo "❌ CLI exited early with code: $EXIT_CODE"
  echo "STDOUT:"
  cat /tmp/cli-stdout.log
  echo "STDERR:"
  cat /tmp/cli-stderr.log
  exit 1
fi

# Check for "Error" in stdout
if grep -q "error" /tmp/cli-stdout.log; then
  echo "❌ Found 'Error' in stdout"
  cat /tmp/cli-stdout.log
  exit 1
fi

# Check for "Error" in stderr
if grep -q "error" /tmp/cli-stderr.log; then
  echo "❌ Found 'Error' in stderr"
  cat /tmp/cli-stderr.log
  exit 1
fi

echo "✅ CLI started successfully without errors"
