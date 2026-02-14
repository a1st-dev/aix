---
trigger: glob
globs: "**/*.vue"
---

   * Assume Vue version 3.5+ unless you see otherwise in package.json
   * Use Vue 3 composition API, SFCs
   * Prefer composition using slots over props when it makes sense
   * Be aware of the different kinds of components: Page-level, layout, UI components that
     contain no business logic, and business-logic-level components
   * For styling:
      * Use SCSS
      * Use scoped styles
      * Look at ./css-scss.md
