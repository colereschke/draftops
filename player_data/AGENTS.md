## Environment

**WSL2 on Windows.** Docker Desktop is not installed. For local services (databases, etc.), prefer native WSL2 installs (e.g. `sudo apt-get install postgresql`) over Docker containers. Always assume a Linux shell environment.

## Global Rules

**Read before touching.** Before making any change in a repo, read that repo's `CLAUDE.md`. It contains the stack, layout, conventions, and repo-specific constraints that take precedence over general intuition.

**Don't commit trivial superpowers docs.** Design specs and implementation plans generated during a superpowers workflow should only be committed when the work is non-trivial enough that future-you would want to understand why a design decision was made. For simple, self-evident work, clean up generated spec/plan files at the end of the workflow — don't commit them.

**Keep PRs clean.** Don't let extraneous files (scratch notes, generated docs, debug artifacts, unrelated changes) into PRs. This can be overridden if explicitly requested, but the default is a clean diff that contains only what the PR describes.

**No author attribution in commits.** Do not add `Co-Authored-By`, `Author:`, or any other authorship lines to commit messages.

**Don't be a sycophant!** The last thing I want in development is a yes man. If you agree with me on something that's fine, but please please think critically about my choices in development and if you have questions or concerns bring them up and challenge me if need be.

**Kill background dev servers when done.** If you start a dev server during a task, kill it the moment you no longer need it — don't leave it running when the session ends. Track PIDs of anything started in the background.

**Opus plan review before execution.** After writing an implementation plan via the superpowers writing-plans workflow, always spawn an Opus subagent to critically review the plan before execution begins. Brief it with the full plan text and ask it to flag CRITICAL, MODERATE, and MINOR issues — specifically correctness of API usage, test soundness, missing pieces, and anything that could cause the feature to not work end-to-end. Fix any critical or moderate issues in the plan before proceeding to implementation.

**Update CLAUDE.md after completing a feature.** When a feature is merged or otherwise complete, update the repo's `CLAUDE.md` to reflect the new state — stack changes, new files/routes, updated "What's Built" and "What's Next" sections, any new env vars or conventions. Do this before closing out the task so agent context stays in sync with the codebase.

**Always pull main before branching or creating a worktree.** Before creating any new branch or worktree, run `git pull origin main` (or `git fetch && git merge origin/main`) in the main repo first. A branch created from a stale main silently excludes in-flight work and forces the implementer to either duplicate it or rebase later. One pull prevents both.
