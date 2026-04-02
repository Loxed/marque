# Step Behavior Notes (`@step` / `@steps`)

This document tracks the current step system behavior and intended usage.

## Current Goals

- Allow lightweight standalone steps without forcing `@end step`.
- Keep structured step groups via `@steps` for explicit grouping.
- Support custom numbering controls:
  - auto
  - hardcoded numbers
  - unnumbered `*`
  - reset numbering in-file

## Supported Syntax

### 1) Standalone step (implicit close allowed)

```mq
@card
  @step
    ## Requirements
    Install Node.js.

  @step 2
    ## Installation
    Run npm install.
@end card
```

Behavior:
- Outside `@steps`, `@step` can close implicitly.
- A new `@step` starts a new sibling step.
- Parent close (like `@end card`) ends the active step.

### 2) Step group

```mq
@steps quickstart
  @step
    ## Create
    marque new my-site
  @end step

  @step
    ## Serve
    marque serve .
  @end step
@end steps quickstart
```

Behavior:
- Inside `@steps`, explicit `@end step` is still the standard structure.

### 3) Number controls

```mq
@steps numbering-demo
  @step
    ## Auto
  @end step

  @step *
    ## Optional note
  @end step

  @step 10
    ## Hardcoded
  @end step

  @step reset:3
    ## Reset to 3
  @end step
@end steps numbering-demo
```

Rules:
- `@step` -> automatic numbering.
- `@step N` -> set current step number to `N`, next auto becomes `N+1`.
- `@step *` -> unnumbered step marker, does not increment sequence.
- `@step reset` -> reset to `1`.
- `@step reset:K` (or `reset=K`) -> reset to `K`.

## Rendering Notes

- Step badge values are rendered via `data-step`.
- CSS displays `attr(data-step)` so values like `*` and hardcoded numbers work.
- Works for both grouped and standalone steps.

## Edge Cases to Keep in Mind

- If multiple `serve` processes run against the same site, Windows file locks can cause noisy rebuild failures; use one serve process at a time.
- If a step uses an invalid number token, it falls back to auto mode.

## Quick Test Cases

1. Two standalone steps in one card, no `@end step`.
2. Grouped steps inside `@steps` with explicit closes.
3. Sequence with `*`, hardcoded number, and reset.
4. Mixed standalone and grouped usage on same page.
