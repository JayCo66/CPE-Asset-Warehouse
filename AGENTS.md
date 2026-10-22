# Git Commit Rules

- Always use Conventional Commits.
- Format: `type(scope): description`
- Allowed types: feat, fix, docs, refactor, test, chore, perf, ci, build, style.
- Use lowercase commit messages.
- Keep descriptions concise.
- Never commit with generic messages.

# Design Guide Rules

- The project's design guide is located at `docs/design-guide.md`.
- Before creating, modifying, or reviewing any UI, UX, styling,
  layout, or frontend components, ALWAYS read `docs/design-guide.md`.
- Follow its color palette, CSS variables, gradients,
  status colors, and visual consistency rules.
- Reuse existing design tokens instead of introducing new colors.
- Do not introduce conflicting styles unless explicitly requested.
- If `docs/design-guide.md` changes, re-read it before continuing
  any design-related work.
- If the file is missing or inaccessible, report the issue
  instead of assuming its contents.

# Frontend Guide Rules

- The project's frontend guide is located at `docs/frontend-guide.md`.
- Before creating, modifying, or reviewing any UI, UX, styling,
  layout, navigation, or frontend components, ALWAYS read both
  `docs/design-guide.md` and `docs/frontend-guide.md`.
- Follow `docs/frontend-guide.md` for frontend design direction,
  floating module navigation, responsive behavior, accessibility,
  and avoiding generic AI-template aesthetics.
- Keep navigation data-driven: do not hardcode module names,
  module counts, or routes into shared navigation components.
- Continue to use `docs/design-guide.md` as the source of truth
  for existing design tokens, colors, CSS variables, and established
  visual conventions. Apply the frontend guide consistently with it.
- If either guide changes, re-read the changed file before
  continuing design-related work.
- If either file is missing or inaccessible, report the issue
  instead of assuming its contents.
