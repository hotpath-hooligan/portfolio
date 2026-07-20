# Assets

- `avatar.glb` — **placeholder**. The CC0 "RobotExpressive" model from the
  three.js examples (Tomás Laulhé / Don McCurdy), used so the 3D pipeline is
  testable before a real avatar exists. Replace it with your own export; see
  CONTENT.md.
- `projects/` — project covers and gallery images, referenced from project
  frontmatter. Astro processes these at build time; do not put them in
  `public/`, which bypasses optimisation entirely.
