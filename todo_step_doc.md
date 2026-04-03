# Removed Directive Notes

`@step` and `@steps` were removed from Marque.

Use `@container` plus markdown numbering or cards instead.

Example migration:

```mq
@container quick-flow
1. Install Node.js
2. Run `npm install`
3. Start with `marque serve .`
@end container quick-flow
```
3. Sequence with `*`, hardcoded number, and reset.
4. Mixed standalone and grouped usage on same page.
