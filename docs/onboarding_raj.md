# Getting Started — Raj

Hi Raj — this is a step-by-step walkthrough to get you set up on the Arena repo and running your first
piece of work. It assumes you haven't used git or Claude Code much before, so it's more detailed than it
needs to be for Marshall or En. If anything doesn't match what you see on your screen, stop and message
Marshall rather than guessing — that's genuinely the right move at any point in this process, not a sign
you did something wrong.

**A few words you'll see a lot:**
- **Repo (repository)** — the project folder, tracked by git, with its full history.
- **Clone** — download your own local copy of the repo.
- **Branch** — a named, separate line of work, so your changes don't collide with anyone else's until
  they're reviewed.
- **Commit** — a saved snapshot of changes, with a message describing what changed.
- **Push** — upload your local commits to GitHub.
- **Pull Request (PR)** — a request asking Marshall to review and merge your branch into the main branch.

---

## What Arena is, and what's been done so far

Arena is a real-time 1v1 browser combat game — this project's term-project deliverable. It's a
TypeScript monorepo (one repo, four packages): `shared` (a framework + shared types Marshall owns),
`server` (Marshall — the authoritative game logic), `client` (**you** — the React browser app), and `api`
(En — persistence and REST endpoints).

So far:
1. **Step 1** — a full class list and UML diagram were designed for the whole system (`docs/01_class_list.md`,
   `docs/01_class_diagram.html`), following the course's Model-View-Controller pattern.
2. **Step 2** — that diagram became real code: every class, interface, and method signature now exists
   in `packages/`, fully declared, and it all compiles. **Nothing is actually implemented yet** — every
   method body just throws a placeholder "not implemented" error. This is deliberate (it's how the
   course's process works): structure first, real logic later, in a future step.
3. **Step 3–5 (done)** — documentation comments added to every class across all four packages, plus an
   auto-built API documentation site. Your `03_client_1` prompt (below) was your piece of this.
4. **Step 6–7 (done)** — a script that reverse-engineers the actual code back into a UML diagram, so the
   diagram and the real code can be checked against each other.
5. **Step 8–10 (in progress)** — this is where real game logic gets implemented and tested for the first
   time, class by class, test-first. Marshall has already built and validated his own pieces (the server's
   match logic). **Your pieces haven't been generated yet — see "What's next for you" below.**

## What your prompt actually does

Your file is `prompts/03_client_1_tsdoc-and-contingency-review.md`. In plain terms, it tells Claude to:
- Go through every file in `packages/client/src/` (the React app — login screen, champion select,
  in-match display, results screen, and the models/controllers behind them) and add clear documentation
  comments to every class, its fields, and its methods.
- Double-check that anywhere something could realistically go wrong (bad input, a disconnected socket,
  etc.) is documented honestly — not that it fixes anything, just that the comments describe reality.
- Confirm everything still compiles, then commit and push its own work to a branch called `client`.

**Nothing about how the app behaves changes.** This is a documentation pass over code that already exists
and already compiles — there's no real game logic in `packages/client` yet for this prompt to break. It's
a good low-risk first task.

---

## Step 1 — Install prerequisites (one-time setup)

You need:
- **Git** — if `git --version` in a terminal doesn't show a version number, install it from
  [git-scm.com](https://git-scm.com/downloads).
- **Node.js 20 or newer** — if `node --version` doesn't show `v20.x` or higher, install it from
  [nodejs.org](https://nodejs.org/) (get the LTS version).
- **Claude Code**, already set up and able to open a folder / run in a terminal. If you don't have this
  yet, ask Marshall — this project assumes a specific setup and it's faster for Marshall to walk you
  through installing it than for these instructions to guess your situation.
- **A terminal** — Terminal on Mac, or Git Bash / PowerShell / Windows Terminal on Windows.

## Step 2 — Clone the repo

Open a terminal, navigate to wherever you want the project folder to live (e.g. your Desktop or Documents),
then run:

```
git clone https://github.com/Blotjarl/arena.git
cd arena
```

You now have a local copy of the whole project, and your terminal is inside it.

## Step 3 — Install dependencies

```
npm install
```

This reads the project's package lists and downloads everything all four packages need (React, Socket.IO,
TypeScript, etc.) into a `node_modules` folder. It can take a minute or two. You only need to do this
once, and again later if you pull down changes that add a new dependency.

## Step 4 — Open Claude Code in this folder

Start Claude Code pointed at the `arena` folder you just cloned (open it from inside the folder in your
terminal, or open/drag the folder in if you're using the desktop or web app — whichever applies to your
setup).

## Step 5 — Load the project's shared context

Every session on this project starts the same way. Tell Claude:

> Please read prompts/00_master_context.md in full before we do anything else.

Wait for it to confirm it's read it.

## Step 6 — Give it your prompt

Open `prompts/03_client_1_tsdoc-and-contingency-review.md` in a text editor (or just have Claude read it —
either works), and tell Claude:

> Please read and follow prompts/03_client_1_tsdoc-and-contingency-review.md now.

If you'd rather be extra sure it sees the exact current content, you can instead open the file yourself,
select all the text, copy it, and paste the whole thing into the chat — both approaches work.

## Step 7 — Let it work

Claude will read files, write documentation comments across `packages/client`, run a compile check, then
create a branch called `client`, commit its work, and push it to GitHub. This can take several minutes —
let it finish. If it stops partway to ask you a question (for example, about something unexpected it
found), answer as best you can or say you're not sure and will check with Marshall — don't guess at
something technical you're unsure about.

## Step 8 — Check what happened

Once it says it's done, run in your terminal:

```
git status
git log --oneline -5
```

You should see you're on a branch called `client`, the working tree is clean ("nothing to commit"), and
the most recent commit is something like "Step 3: client TSDoc pass and contingency review."

## Step 9 — Open a Pull Request

You have two options:

**Ask Claude to do it:**
> Please open a pull request for this branch into main.

**Or do it yourself on GitHub:**
1. Go to [github.com/Blotjarl/arena](https://github.com/Blotjarl/arena) in your browser.
2. You should see a banner near the top: "`client` had recent pushes" with a green **Compare & pull
   request** button. Click it.
3. Review the title and description (Claude usually writes a reasonable one from the commit message —
   you don't need to rewrite it).
4. Click **Create pull request**.

## Step 10 — Tell Marshall

Message Marshall that the PR is up. Marshall reviews and merges it into `main`. That's the end of this
round for you — wait for the next prompt assignment rather than starting anything else on your own.

---

## What's next for you (Step 9–10)

Once your `03_client_1` PR is merged, your next work isn't a single prompt file yet — it's two
**meta-prompts** that generate your actual prompts:

- `prompts/META_02_client-model.md` — generates three prompts (`09_client_1`, `09_client_2`, `09_client_3`)
  covering `packages/client`'s model classes (your identity/queue/match state and the position-interpolation
  logic used for smooth movement). These don't depend on anyone else's work — they can start any time.
- `prompts/META_05_client-controller-view.md` — generates nine prompts covering the React screens and
  controllers. This one is **blocked** until the three model prompts above are written, executed, and
  merged into `main` first (the controllers/views call into that model code).

Marshall runs the meta-prompts himself (or hands them to you once they're ready to execute) — you don't
need to do anything with `META_02`/`META_05` directly. What changes for you: once Marshall tells you the
`09_client_*` and `10_client_*` prompt files exist in `prompts/`, you'll run them the same way you ran
`03_client_1` above (Step 5 → load `00_master_context.md`, Step 6 → give it the specific prompt file, Step
7-10 → let it work, check the branch, open a PR). Each of those files will open with `**Owner: Raj.**` so
you can always tell which ones are yours. Wait for Marshall to point you at them rather than guessing which
are ready — some have real dependencies on work that isn't merged yet.

## If something goes wrong

- Claude reports an error, or something it expected to find isn't there, or a git command fails: **stop,
  don't try to fix it yourself, message Marshall** with what you see on screen (a screenshot is fine).
- These prompts are deliberately written to make Claude stop and ask rather than guess when something's
  off — if that happens to you, it's the system working correctly, not something you broke.
