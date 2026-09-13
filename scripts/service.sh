#!/usr/bin/env bash
# ==============================================================================
# Money In Minutes — Background Service Manager (macOS LaunchAgent)
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
LABEL="com.moneyinminutes.automation"
PLIST_NAME="${LABEL}.plist"
TARGET_DIR="$HOME/Library/LaunchAgents"
TARGET_PLIST="$TARGET_DIR/$PLIST_NAME"
SOURCE_PLIST="$SCRIPT_DIR/$PLIST_NAME"
PID_FILE="$PROJECT_ROOT/data/scheduler.pid"
STDOUT_LOG="$PROJECT_ROOT/logs/launchagent-stdout.log"
STDERR_LOG="$PROJECT_ROOT/logs/launchagent-stderr.log"
SCHEDULER_LOG="$PROJECT_ROOT/logs/dailyautomation.log"

ensure_installed() {
  mkdir -p "$TARGET_DIR"
  mkdir -p "$PROJECT_ROOT/logs"
  mkdir -p "$PROJECT_ROOT/data"

  if [ ! -f "$TARGET_PLIST" ] || [ "$SOURCE_PLIST" -nt "$TARGET_PLIST" ]; then
    cp "$SOURCE_PLIST" "$TARGET_PLIST"
    chmod 644 "$TARGET_PLIST"
  fi
}

cmd_start() {
  echo "🚀 Starting Money In Minutes background automation service..."
  ensure_installed

  # Check if already loaded in launchctl
  if launchctl list | grep -q "$LABEL"; then
    echo "ℹ️  Service '$LABEL' is already loaded in launchd."
  else
    launchctl load -w "$TARGET_PLIST"
    echo "✅ LaunchAgent loaded successfully."
  fi

  sleep 2
  cmd_status
}

cmd_stop() {
  echo "🛑 Stopping Money In Minutes background automation service..."
  if [ -f "$TARGET_PLIST" ]; then
    if launchctl list | grep -q "$LABEL"; then
      launchctl unload -w "$TARGET_PLIST" 2>/dev/null || true
      echo "✅ LaunchAgent unloaded."
    else
      echo "ℹ️  Service was not running in launchd."
    fi
  fi

  # Clean up PID file if leftover
  if [ -f "$PID_FILE" ]; then
    PID=$(cat "$PID_FILE" 2>/dev/null || true)
    if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; then
      kill "$PID" 2>/dev/null || true
      sleep 1
    fi
    rm -f "$PID_FILE"
  fi

  echo "⏹️  Background service stopped."
}

cmd_restart() {
  echo "🔄 Restarting Money In Minutes background automation service..."
  cmd_stop
  sleep 2
  cmd_start
}

cmd_status() {
  echo "=================================================="
  echo " Money In Minutes — Background Service Status"
  echo "=================================================="

  IS_LOADED=false
  LAUNCHCTL_LINE=$(launchctl list | grep "$LABEL" || true)
  if [ -n "$LAUNCHCTL_LINE" ]; then
    IS_LOADED=true
    L_PID=$(echo "$LAUNCHCTL_LINE" | awk '{print $1}')
    L_STATUS=$(echo "$LAUNCHCTL_LINE" | awk '{print $2}')
    echo "LaunchAgent Status:  LOADED in launchd"
    echo "LaunchAgent PID:     ${L_PID:-"-"}"
    echo "Last Exit Code:      ${L_STATUS:-0}"
  else
    echo "LaunchAgent Status:  NOT LOADED"
  fi

  if [ -f "$PID_FILE" ]; then
    SCHED_PID=$(cat "$PID_FILE" 2>/dev/null || true)
    if [ -n "$SCHED_PID" ] && kill -0 "$SCHED_PID" 2>/dev/null; then
      echo "Scheduler Process:   ACTIVE (PID: $SCHED_PID)"
      ps -p "$SCHED_PID" -o pid,user,%cpu,%mem,etime,command | tail -n 1 | awk '{print "Process Details:     PID "$1" | User "$2" | CPU "$3"% | MEM "$4"% | Uptime "$5}'
    else
      echo "Scheduler Process:   INACTIVE (Stale PID file: $SCHED_PID)"
    fi
  else
    echo "Scheduler Process:   NO PID file found"
  fi

  echo "Service Plist:       $TARGET_PLIST"
  echo "Standard Out Log:    $STDOUT_LOG"
  echo "Standard Error Log:  $STDERR_LOG"
  echo "Target Schedule:     17:00 UTC = 10:30 PM IST (Daily target: >= 1 Short)"
  echo "=================================================="
}

cmd_logs() {
  echo "=== Standard Output (${STDOUT_LOG}) ==="
  if [ -f "$STDOUT_LOG" ]; then
    tail -n 20 "$STDOUT_LOG"
  else
    echo "(No stdout log generated yet)"
  fi

  echo ""
  echo "=== Standard Error (${STDERR_LOG}) ==="
  if [ -f "$STDERR_LOG" ]; then
    tail -n 20 "$STDERR_LOG"
  else
    echo "(No stderr log generated yet)"
  fi

  echo ""
  echo "=== Daily Automation Winston Log (${SCHEDULER_LOG}) ==="
  if [ -f "$SCHEDULER_LOG" ]; then
    tail -n 20 "$SCHEDULER_LOG"
  else
    echo "(No daily automation log generated yet)"
  fi
}

cmd_uninstall() {
  echo "⚠️  Uninstalling Money In Minutes background automation LaunchAgent..."
  if launchctl list | grep -q "$LABEL"; then
    launchctl unload -w "$TARGET_PLIST" 2>/dev/null || true
  fi
  rm -f "$TARGET_PLIST"
  rm -f "$PID_FILE"
  echo "✅ LaunchAgent uninstalled."
}

ACTION="${1:-status}"

case "$ACTION" in
  start)
    cmd_start
    ;;
  stop)
    cmd_stop
    ;;
  restart)
    cmd_restart
    ;;
  status)
    cmd_status
    ;;
  logs)
    cmd_logs
    ;;
  uninstall)
    cmd_uninstall
    ;;
  *)
    echo "Usage: $0 {start|stop|restart|status|logs|uninstall}"
    exit 1
    ;;
esac
