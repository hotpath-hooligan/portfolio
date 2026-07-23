---
title: Pixel Souls
blurb: >-
  A three-level 2D dungeon crawler with state-machine combat AI, projectile
  physics, and a final boss encounter.
stack: [Python, Pygame, WebAssembly, Game AI]
repo: https://github.com/hotpath-hooligan/Pixel_Souls
demo: https://hotpath-hooligan.github.io/Pixel_Souls/
order: 5
---

A 2D dungeon crawler built with Python and Pygame. It has three increasingly
difficult levels, five regular enemy archetypes with distinct attack styles,
ranged combat with projectile and stun mechanics, collectible items, and a
final Big Demon boss encounter. Enemy behavior is coordinated through an
explicit AI state machine rather than being embedded in the rendering loop.

The design goal was Souls-like combat legibility at 2D pixel scale: telegraphed
attack windups, punish windows, and boss phase transitions that change the
pattern rather than just the damage numbers.

The same project ships three ways: as Python source, as standalone Windows,
macOS, and Linux releases built with PyInstaller, and as a browser build packaged
to WebAssembly with pygbag. The web version includes browser-safe audio and
the release workflow produces platform-specific downloads from version tags.
