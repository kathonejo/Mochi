#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$ROOT_DIR/foundry/.env"
INTERACTIVE=0
UI_OUT="/dev/stdout"

if [ -t 0 ] && [ -t 1 ]; then
  INTERACTIVE=1
fi
if [ "$INTERACTIVE" -eq 1 ] && [ -w /dev/tty ]; then
  UI_OUT="/dev/tty"
fi

need_cmd() {
  command -v "$1" >/dev/null 2>&1
}

drain_tty_input() {
  local _
  if [ "$INTERACTIVE" -ne 1 ] || [ ! -r /dev/tty ]; then
    return
  fi
  while IFS= read -rsn1 -t 0.01 _ < /dev/tty; do :; done
}

ui_printf() {
  printf "$@" >"$UI_OUT"
}

ui_echo() {
  ui_printf "%s\n" "$*"
}

print_pet_art() {
  cat >"$UI_OUT" <<'ART'
      (\_/)        /\_/\
      (o.o)       ( o.o )
      /|_|\        > ^ <
ART
}

print_happy_art() {
  cat >"$UI_OUT" <<'ART'
      (\_/)        /\_/\
      (^.^)       (^.^)
      /|_|\        > ^ <
ART
}

print_sad_art() {
  cat >"$UI_OUT" <<'ART'
      (\_/)        /\_/\
      (T.T)       (T.T)
      /|_|\        > ~ <
ART
}

progress_line() {
  local pct="$1"
  local label="$2"
  local width=26
  local filled=$((pct * width / 100))
  local empty=$((width - filled))
  ui_printf "\r[%s%s] %3d%% %s" \
    "$(printf '%*s' "$filled" '' | tr ' ' '#')" \
    "$(printf '%*s' "$empty" '' | tr ' ' '-')" \
    "$pct" \
    "$label"
}

run_with_loading_bar() {
  local title="$1"
  local detail="$2"
  shift 2

  local log_file pid rc elapsed pct
  log_file="$(mktemp)"

  ui_echo ""
  print_pet_art
  ui_echo "$title"
  ui_echo "  $detail"

  "$@" >"$log_file" 2>&1 &
  pid=$!

  local start_ts="$SECONDS"
  while kill -0 "$pid" >/dev/null 2>&1; do
    elapsed=$((SECONDS - start_ts))
    pct=$((5 + (elapsed * 8) % 89))
    progress_line "$pct" "$title"
    sleep 0.2
  done

  if wait "$pid"; then
    progress_line 100 "$title"
    ui_echo ""
    rm -f "$log_file"
    return 0
  fi

  rc=$?
  progress_line 100 "$title (failed)"
  ui_echo ""
  print_sad_art
  ui_echo "Something failed during: $title"
  ui_echo "Recent output:"
  sed -n '1,120p' "$log_file" >"$UI_OUT"
  rm -f "$log_file"
  return "$rc"
}

is_wsl() {
  if [ -n "${WSL_DISTRO_NAME:-}" ]; then
    return 0
  fi
  grep -qiE "(microsoft|wsl)" /proc/version 2>/dev/null
}

is_macos() {
  [ "$(uname -s)" = "Darwin" ]
}

load_root_env_file() {
  if [ ! -f "$ENV_FILE" ]; then
    return
  fi

  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
}

ensure_pnpm() {
  local pnpm_version="10.24.0"

  if need_cmd pnpm; then
    ui_echo "==> pnpm ready: $(pnpm --version)"
    return
  fi

  if need_cmd corepack; then
    run_with_loading_bar \
      "Preparing pnpm" \
      "Enabling pnpm via corepack" \
      bash -lc "corepack enable >/dev/null 2>&1 || true; corepack prepare pnpm@${pnpm_version} --activate >/dev/null 2>&1 || true"
  fi

  if need_cmd pnpm; then
    ui_echo "==> pnpm ready: $(pnpm --version)"
    return
  fi

  if need_cmd npm; then
    ui_echo "==> pnpm not found. Installing with npm..."
    if run_with_loading_bar \
      "Installing pnpm" \
      "Running npm install -g pnpm@${pnpm_version}" \
      npm install -g "pnpm@${pnpm_version}"; then
      hash -r
    elif need_cmd sudo && [ "$INTERACTIVE" -eq 1 ]; then
      ui_echo "==> Retrying pnpm install with sudo..."
      run_with_loading_bar \
        "Installing pnpm" \
        "Running sudo npm install -g pnpm@${pnpm_version}" \
        sudo npm install -g "pnpm@${pnpm_version}" || true
      hash -r
    fi
  fi

  if ! need_cmd pnpm; then
    print_sad_art
    echo "Error: pnpm installation failed." >&2
    echo "Install Node.js (with corepack) or npm, then re-run ./launch.sh." >&2
    exit 1
  fi

  ui_echo "==> pnpm ready: $(pnpm --version)"
}

ensure_workspace_install() {
  if [ -d "$ROOT_DIR/node_modules" ]; then
    ui_echo "==> Workspace dependencies already installed."
    return
  fi
  run_with_loading_bar \
    "Installing workspace dependencies" \
    "Running pnpm install at the repository root" \
    bash -lc "cd \"$ROOT_DIR\" && pnpm install"
}

arrow_menu() {
  local title="$1"
  shift
  local options=("$@")
  local selected=0
  local key extra

  if [ "$INTERACTIVE" -ne 1 ]; then
    echo "0"
    return 0
  fi
  drain_tty_input

  while true; do
    clear >"$UI_OUT"
    print_pet_art
    ui_echo "$title"
    ui_echo "Use arrow keys and Enter."
    ui_echo ""

    local i
    for i in "${!options[@]}"; do
      if [ "$i" -eq "$selected" ]; then
        ui_printf " > %s\n" "${options[$i]}"
      else
        ui_printf "   %s\n" "${options[$i]}"
      fi
    done

    IFS= read -rsn1 key < /dev/tty || true
    case "$key" in
      "")
        echo "$selected"
        return 0
        ;;
      $'\n')
        echo "$selected"
        return 0
        ;;
      $'\x1b')
        IFS= read -rsn2 -t 0.1 extra < /dev/tty || true
        case "$extra" in
          "[A")
            if [ "$selected" -eq 0 ]; then
              selected=$((${#options[@]} - 1))
            else
              selected=$((selected - 1))
            fi
            ;;
          "[B")
            selected=$(((selected + 1) % ${#options[@]}))
            ;;
        esac
        ;;
      k)
        if [ "$selected" -eq 0 ]; then
          selected=$((${#options[@]} - 1))
        else
          selected=$((selected - 1))
        fi
        ;;
      j)
        selected=$(((selected + 1) % ${#options[@]}))
        ;;
    esac
  done
}

select_network() {
  local idx
  idx="$(arrow_menu "Choose one-command path" \
    "local: experiment locally (chain + frontend + local deploy)" \
    "testnet: deploy contracts to testnet (with Vercel env guidance)" \
    "mainnet: deploy contracts to mainnet (with Vercel env guidance)")"
  case "$idx" in
    0) echo "local" ;;
    1) echo "testnet" ;;
    2) echo "mainnet" ;;
    *) echo "local" ;;
  esac
}

select_credential_mode() {
  local idx
  idx="$(arrow_menu "Select deploy credential mode" \
    "Create or choose wallet inside deploy wizard (recommended)" \
    "Use foundry/.env credentials or existing alias automatically" \
    "Type seed phrase in deploy tab/terminal" \
    "Type secret key in deploy tab/terminal" \
    "Cancel")"
  case "$idx" in
    0) echo "wallet-wizard" ;;
    1) echo "env-or-alias" ;;
    2) echo "prompt-seed" ;;
    3) echo "prompt-secret" ;;
    *) echo "cancel" ;;
  esac
}

compose_deploy_command() {
  local network="$1"
  local cred_mode="$2"
  local deploy_cmd=""

  case "$cred_mode" in
    wallet-wizard)
      deploy_cmd="pnpm run deploy:${network}"
      ;;
    env-or-alias)
      deploy_cmd="pnpm run deploy:${network}"
      ;;
    prompt-seed)
      deploy_cmd="read -r -p \"Seed phrase (12/24 words): \" STELLAR_MNEMONIC; STELLAR_MNEMONIC=\"\$STELLAR_MNEMONIC\" pnpm run deploy:${network}"
      ;;
    prompt-secret)
      deploy_cmd="read -r -s -p \"Secret key (S...): \" STELLAR_SECRET_SEED; echo; STELLAR_SECRET_SEED=\"\$STELLAR_SECRET_SEED\" pnpm run deploy:${network}"
      ;;
    *)
      deploy_cmd="pnpm run deploy:${network}"
      ;;
  esac

  printf "%s" "$deploy_cmd"
}

open_in_new_terminal() {
  local label="$1"
  local run_cmd="$2"
  local wrapped script_file distro mac_cmd escaped

  script_file="/tmp/mochi-launch-${label}-$$-$(date +%s).sh"
  {
    echo "#!/usr/bin/env bash"
    printf "cd %q\n" "$ROOT_DIR"
    printf "%s\n" "$run_cmd"
    echo "echo"
    printf "echo %q\n" "[${label}] session ready. Close this tab when done."
    echo "exec bash"
  } > "$script_file"
  chmod +x "$script_file"

  wrapped="bash \"$script_file\""

  if [ -n "${TMUX:-}" ] && need_cmd tmux; then
    tmux new-window -n "$label" "cd \"$ROOT_DIR\" && $wrapped" >/dev/null 2>&1
    return $?
  fi

  if is_wsl && need_cmd cmd.exe; then
    distro="${WSL_DISTRO_NAME:-}"
    if [ -n "$distro" ]; then
      cmd.exe /C start "" wt -w 0 new-tab wsl.exe -d "$distro" --cd "$ROOT_DIR" bash "$script_file" >/dev/null 2>&1
    else
      cmd.exe /C start "" wt -w 0 new-tab wsl.exe --cd "$ROOT_DIR" bash "$script_file" >/dev/null 2>&1
    fi
    return $?
  fi

  if is_macos && need_cmd osascript; then
    mac_cmd="$(printf 'cd %q && %s' "$ROOT_DIR" "$wrapped")"
    escaped="${mac_cmd//\\/\\\\}"
    escaped="${escaped//\"/\\\"}"
    osascript -e "tell application \"Terminal\" to do script \"$escaped\"" >/dev/null 2>&1
    return $?
  fi

  if need_cmd gnome-terminal; then
    gnome-terminal -- bash -lc "cd \"$ROOT_DIR\" && $wrapped" >/dev/null 2>&1 &
    return $?
  fi

  if need_cmd x-terminal-emulator; then
    x-terminal-emulator -e bash -lc "cd \"$ROOT_DIR\" && $wrapped" >/dev/null 2>&1 &
    return $?
  fi

  if need_cmd konsole; then
    konsole --new-tab -e bash -lc "cd \"$ROOT_DIR\" && $wrapped" >/dev/null 2>&1 &
    return $?
  fi

  if need_cmd xterm; then
    xterm -e bash -lc "cd \"$ROOT_DIR\" && $wrapped" >/dev/null 2>&1 &
    return $?
  fi

  return 1
}

run_in_current_terminal() {
  local run_cmd="$1"
  (
    cd "$ROOT_DIR"
    bash -lc "$run_cmd"
  )
}

print_manual_commands() {
  local deploy_cmd="$1"
  local network="$2"

  ui_echo ""
  ui_echo "Could not open tabs automatically in this terminal environment."
  if [ "$network" = "local" ]; then
    ui_echo "Run these in 3 separate tabs:"
    ui_echo "  Tab 1: cd \"$ROOT_DIR\" && pnpm chain"
    ui_echo "  Tab 2: cd \"$ROOT_DIR\" && pnpm start"
    ui_echo "  Tab 3: cd \"$ROOT_DIR\" && $deploy_cmd"
    ui_echo "  Frontend port is auto-detected and saved to $ROOT_DIR/.deploy-env/frontend.env"
  else
    ui_echo "Run these in 2 separate tabs:"
    ui_echo "  Tab 1: cd \"$ROOT_DIR\" && pnpm start"
    ui_echo "  Tab 2: cd \"$ROOT_DIR\" && $deploy_cmd"
    ui_echo "  Frontend port is auto-detected and saved to $ROOT_DIR/.deploy-env/frontend.env"
  fi
  ui_echo ""
}

launch_full_experience() {
  local network cred_mode deploy_cmd deploy_rc idx
  local launched_chain=0 launched_front=0 launched_deploy=0

  network="$(select_network)"
  cred_mode="$(select_credential_mode)"
  if [ "$cred_mode" = "cancel" ]; then
    return 0
  fi

  deploy_cmd="$(compose_deploy_command "$network" "$cred_mode")"

  if [ "$cred_mode" = "wallet-wizard" ]; then
    ui_echo "==> Wallet onboarding mode: running in this terminal (no auto tabs)."
    set +e
    run_in_current_terminal "$deploy_cmd"
    deploy_rc=$?
    set -e
    if [ "$deploy_rc" -ne 0 ]; then
      ui_echo "Deploy wizard exited with code $deploy_rc."
      return "$deploy_rc"
    fi
    if [ "$INTERACTIVE" -eq 1 ]; then
      idx="$(arrow_menu "Deploy finished" \
        "Start frontend now in this terminal (pnpm start)" \
        "Exit launcher")"
      if [ "$idx" = "0" ]; then
        run_in_current_terminal "pnpm start"
      fi
    fi
    return 0
  fi

  if [ "$network" = "local" ]; then
    ui_echo "==> Launching chain tab..."
    if open_in_new_terminal "chain" "pnpm chain"; then
      launched_chain=1
    fi
  else
    ui_echo "==> Chain tab not required for $network."
    launched_chain=1
  fi

  ui_echo "==> Launching frontend tab..."
  if open_in_new_terminal "frontend" "pnpm start"; then
    launched_front=1
  fi

  ui_echo "==> Launching deploy tab..."
  if open_in_new_terminal "deploy" "$deploy_cmd"; then
    launched_deploy=1
  fi

  if [ "$launched_chain" -eq 1 ] && [ "$launched_front" -eq 1 ] && [ "$launched_deploy" -eq 1 ]; then
    ui_echo ""
    print_happy_art
    ui_echo "Launch commands submitted to separate tabs."
    ui_echo "- Chain: launch requested in its own tab"
    ui_echo "- Frontend: launch requested in its own tab"
    ui_echo "- Deploy: launch requested in its own tab"
    ui_echo ""
    ui_echo "Verify each tab stays open and reaches a healthy state."
    ui_echo "Frontend writes its chosen local URL to $ROOT_DIR/.deploy-env/frontend.env."
    ui_echo "After deploy completes, it auto-creates the first auction (default) and prints the details."
    ui_echo "Deploy flow now also runs guided on-chain verification and source publication metadata checks."
    if [ "$network" = "testnet" ] || [ "$network" = "mainnet" ]; then
      ui_echo "Deploy output also includes Vercel env vars to leave frontend online."
    fi
    return 0
  fi

  print_manual_commands "$deploy_cmd" "$network"

  if [ "$INTERACTIVE" -eq 1 ]; then
    local idx
    idx="$(arrow_menu "Fallback action" \
      "Run deploy here now" \
      "Do nothing and exit")"
    if [ "$idx" = "0" ]; then
      run_in_current_terminal "$deploy_cmd"
    fi
  fi
}

run_chain_only() {
  run_in_current_terminal "pnpm chain"
}

ensure_vercel_cli() {
  if need_cmd vercel; then
    ui_echo "==> vercel CLI ready: $(vercel --version 2>/dev/null | head -n1)"
    return 0
  fi

  if ! need_cmd npm; then
    ui_echo "npm not found. Install Node.js first to use Vercel deploy from launcher."
    return 1
  fi

  if run_with_loading_bar \
    "Installing Vercel CLI" \
    "Running npm install -g vercel" \
    npm install -g vercel; then
    hash -r
    ui_echo "==> vercel CLI ready."
    return 0
  fi

  if need_cmd sudo && [ "$INTERACTIVE" -eq 1 ]; then
    ui_echo "Retrying Vercel CLI install with sudo..."
    if run_with_loading_bar \
      "Installing Vercel CLI" \
      "Running sudo npm install -g vercel" \
      sudo npm install -g vercel; then
      hash -r
      ui_echo "==> vercel CLI ready."
      return 0
    fi
  fi

  ui_echo "Could not install Vercel CLI automatically."
  return 1
}

run_vercel_deploy() {
  local idx cmd
  if ! ensure_vercel_cli; then
    return 1
  fi

  if ! vercel whoami >/dev/null 2>&1; then
    ui_echo "Vercel login required."
    idx="$(arrow_menu "Authenticate with Vercel" \
      "Login now (browser/email flow)" \
      "Back")"
    if [ "$idx" = "0" ]; then
      run_in_current_terminal "cd \"$ROOT_DIR/nextjs\" && vercel login" || return 1
    else
      return 0
    fi
  fi

  idx="$(arrow_menu "Vercel deploy mode (frontend)" \
    "Production deploy (vercel --prod)" \
    "Preview deploy (vercel)" \
    "Back")"
  case "$idx" in
    0) cmd="cd \"$ROOT_DIR/nextjs\" && vercel --prod" ;;
    1) cmd="cd \"$ROOT_DIR/nextjs\" && vercel" ;;
    *) return 0 ;;
  esac

  ui_echo "==> Launching Vercel deploy flow..."
  run_in_current_terminal "$cmd"
  return 0
}

run_github_push() {
  local repo_root branch push_cmd
  repo_root="$(cd "$ROOT_DIR/.." && pwd)"
  branch="$(git -C "$repo_root" branch --show-current 2>/dev/null || true)"
  push_cmd="cd \"$repo_root\" && git push origin \"$branch\""

  if [ -z "$branch" ]; then
    ui_echo "Could not detect git branch."
    return 1
  fi

  ui_echo "==> Current branch: $branch"
  ui_echo "==> Working tree status:"
  git -C "$repo_root" status --short >"$UI_OUT" 2>/dev/null || true

  if ! git -C "$repo_root" diff --quiet || ! git -C "$repo_root" diff --cached --quiet; then
    local idx
    idx="$(arrow_menu "There are uncommitted changes" \
      "Push only existing commits on current branch" \
      "Back")"
    [ "$idx" = "0" ] || return 0
  fi

  ui_echo "==> Pushing branch '$branch' to origin..."
  if run_in_current_terminal "$push_cmd"; then
    return 0
  fi

  ui_echo "Push failed. Credentials may be required."
  if need_cmd gh; then
    local idx
    idx="$(arrow_menu "GitHub authentication" \
      "Login with browser (gh auth login --web)" \
      "Back")"
    if [ "$idx" = "0" ]; then
      if run_in_current_terminal "gh auth login --web"; then
        ui_echo "Retrying push..."
        run_in_current_terminal "$push_cmd" || return 1
      else
        return 1
      fi
    fi
  else
    ui_echo "Tip: install GitHub CLI and run: gh auth login --web"
    return 1
  fi
  return 0
}

run_frontend_only() {
  local idx
  idx="$(arrow_menu "Frontend actions" \
    "Local development (pnpm start)" \
    "Deploy frontend to Vercel" \
    "Push branch to GitHub" \
    "Back")"

  case "$idx" in
    0) run_in_current_terminal "pnpm start" ;;
    1) run_vercel_deploy ;;
    2) run_github_push ;;
    *) return 0 ;;
  esac
}

run_deploy_only() {
  local network cred_mode deploy_cmd
  network="$(select_network)"
  cred_mode="$(select_credential_mode)"
  if [ "$cred_mode" = "cancel" ]; then
    return 0
  fi

  deploy_cmd="$(compose_deploy_command "$network" "$cred_mode")"
  run_in_current_terminal "$deploy_cmd"
}

main_menu() {
  local idx
  idx="$(arrow_menu "Mochi AVAX Command Center" \
    "Full experience (frontend + chain + deploy in separate tabs)" \
    "Run chain only" \
    "Frontend actions (local/vercel/github)" \
    "Run deploy only" \
    "Exit")"
  echo "$idx"
}

main() {
  ui_echo ""
  print_pet_art
  ui_echo "Mochi AVAX launcher starting..."
  ensure_pnpm
  ensure_workspace_install
  load_root_env_file

  while true; do
    case "$(main_menu)" in
      0)
        launch_full_experience
        break
        ;;
      1) run_chain_only ;;
      2) run_frontend_only ;;
      3) run_deploy_only ;;
      4) break ;;
      *) break ;;
    esac

    if [ "$INTERACTIVE" -ne 1 ]; then
      break
    fi
    drain_tty_input
  done
}

main "$@"
