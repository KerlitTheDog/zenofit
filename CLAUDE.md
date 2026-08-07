# Git workflow

This folder is a git repo connected to https://github.com/KerlitTheDog/zenofit (branch `main`).

The user has explicitly authorized automatic commit + push: after making edits to files in this project, commit them with a concise, why-focused message and `git push` to `origin main` without asking for confirmation first. This stands as durable authorization for routine pushes to this repo — no need to re-confirm each time.

Exceptions — stop and ask instead of pushing automatically:
- The push is rejected (non-fast-forward, diverged history, etc.) — never force-push without explicit permission.
- The change is something the user would want to review first (e.g. a large/risky rewrite) rather than a routine edit.
- Anything destructive to git history (rebase, reset --hard, force-push) — always ask first regardless of the above.
