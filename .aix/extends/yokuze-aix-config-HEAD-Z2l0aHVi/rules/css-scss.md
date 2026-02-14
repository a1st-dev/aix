---
trigger: glob
globs: "**/*.css,**/*.scss"
---

   * If using a component library, prefer using the component's existing props etc. over
     custom styling
   * If none is available, prefer pre-existing utility classes over custom styling
   * Avoid ad-hoc CSS unless necessary
   * Use BEM or other similar naming conventions for custom CSS
   * Use CSS variables for theme-able values
   * Consider adding a custom utility class to the global CSS/SCSS if it seems
     necessary/used in multiple places
