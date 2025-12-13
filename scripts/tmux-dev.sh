#!/bin/bash

SESSION_NAME="relay-mcp-dev"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Kill existing session if it exists
tmux kill-session -t $SESSION_NAME 2>/dev/null

# Create new session with the relay server in the top pane
tmux new-session -d -s $SESSION_NAME -n "dev" -c "$PROJECT_DIR"

# Enable pane titles and remain on exit
tmux set-option -t $SESSION_NAME remain-on-exit on
tmux set-option -t $SESSION_NAME pane-border-status top
tmux set-option -t $SESSION_NAME pane-border-format " #{pane_index}: #{pane_title} "

# Run relay server in the first pane with title
tmux select-pane -t $SESSION_NAME:0.0 -T "relay-server"
tmux send-keys -t $SESSION_NAME:0.0 "pnpm run serve" C-m

# Split horizontally and run frontend in the bottom pane
tmux split-window -v -t $SESSION_NAME -c "$PROJECT_DIR"
tmux select-pane -t $SESSION_NAME:0.1 -T "frontend"
tmux send-keys -t $SESSION_NAME:0.1 "pnpm run dev" C-m

# Select the top pane
tmux select-pane -t $SESSION_NAME:0.0

echo "Started tmux session: $SESSION_NAME"
echo "  Top pane:    relay-server (pnpm run serve)"
echo "  Bottom pane: frontend (pnpm run dev)"
echo ""

# Auto-attach if running in a terminal, otherwise print instructions
if [ -t 0 ] && [ -t 1 ] && [ "$1" != "--detach" ]; then
    tmux attach-session -t $SESSION_NAME
else
    echo "To attach: tmux attach -t $SESSION_NAME"
    echo "To detach: Ctrl+b then d"
fi
