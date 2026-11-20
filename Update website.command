#!/bin/bash
# Double-click this file to bring this folder and GitHub in step — and with
# them the website.
#
#   1. Changes made on GitHub (a merged pull request, Claude's work) come down
#      into this folder.
#   2. Changes you made in this folder go up to GitHub.
#   3. GitHub then tests the new version and, if every test passes, puts it on
#      the website by itself (about 10 minutes). If a test fails, the website
#      keeps the previous version and nothing breaks.
#
# The pupils' accounts and progress live on the website's own disk; nothing
# here touches them. Running this when nothing has changed is harmless.
set -uo pipefail
cd "$(dirname "$0")" || exit 1
REPO_URL="https://github.com/eliaseythorsson/fallaskoli"

bold() { printf '\n\033[1m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }
stop() {
  printf '\n\033[31mSTOPPED:\033[0m %s\n' "$*" >&2
  read -r -p "Press Enter to close this window. " _
  exit 1
}

command -v git >/dev/null || stop "git is missing. Run 'Set up git repository.command' from the old folder first."
[ -d .git ] || stop "This folder is not linked to GitHub (no .git folder)."
# Use the GitHub login that the 'gh' tool already has, if it is installed.
command -v gh >/dev/null && gh auth setup-git >/dev/null 2>&1

branch="$(git rev-parse --abbrev-ref HEAD)"
if [ "$branch" != "main" ]; then
  if [ -z "$(git status --porcelain)" ]; then
    bold "Switching this folder back to main (it was on '$branch')"
    git switch -q main || stop "Could not switch to main."
  else
    stop "This folder is on the branch '$branch' (not main) and has unsaved changes. Ask Claude to sort it out — nothing was changed."
  fi
fi

bold "1. Your changes in this folder"
if [ -n "$(git status --porcelain)" ]; then
  git status --short
  echo
  read -r -p "In a few words, what did you change? (Enter = 'Changes from my Mac') " msg
  [ -n "$msg" ] || msg="Changes from my Mac"
  git add -A
  git commit -q -m "$msg" || stop "Could not save the changes."
  green "  saved: $msg"
else
  echo "  none"
fi

bold "2. Changes from GitHub"
if ! git pull -q --rebase origin main; then
  git rebase --abort >/dev/null 2>&1
  stop "Your changes and the ones on GitHub touch the same lines. Nothing was lost and nothing was sent. Ask Claude to merge them."
fi
green "  this folder now has everything that is on GitHub"

bold "3. Sending to GitHub"
if [ "$(git rev-list --count origin/main..main)" = "0" ]; then
  echo "  nothing new to send"
  echo
  green "Everything is up to date."
else
  git push -q origin main || stop "Could not send to GitHub. If it asked for a password: run  gh auth login  in Terminal once (see WEBSITE.md), then try again."
  green "  sent"
  echo
  green "Done. The website updates itself in about 10 minutes."
  echo "To watch it happen, look at: $REPO_URL/actions"
fi
echo
read -r -p "Press Enter to close this window. " _
