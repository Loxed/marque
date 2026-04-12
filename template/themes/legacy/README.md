# Legacy Themes

These bundled themes are kept for backwards compatibility and as larger showcase references.

- `comte.css` is the modern token-first base theme and stays at `themes/comte.css`.
- `gouda.css`, `rustique.css`, and `pycorino.css` are the current bundled alternates and stay at the root of `themes/`.
- New custom themes should normally be created in `themes/` with `marque theme new <name>`.
- Legacy-only themes can still be referenced by bare name for compatibility. If a current root theme shares the same name, use `legacy/<name>` to force the older variant.

Examples:

```toml
theme = legacy/rustique
```

```sh
marque theme template . themes/my-theme.css --reference legacy/rustique
```
