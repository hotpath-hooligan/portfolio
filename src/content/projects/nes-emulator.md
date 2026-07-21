---
title: GoNES
blurb: >-
  A complete NES emulator in Go, delivered to the browser through WebAssembly.
stack: [Go, WebAssembly, Emulation, Ebitengine]
repo: https://github.com/hotpath-hooligan/nes-emu
demo: https://hotpath-hooligan.github.io/nes-emu/
featured: true
order: 3
---

A Nintendo Entertainment System emulator written in Go with a platform-neutral
core covering the MOS 6502 CPU, PPU graphics, five-channel APU audio, cartridge
memory, and controllers. It supports six mapper families—NROM, MMC1, UxROM,
CNROM, AxROM, and Color Dreams—and runs in the browser at 60 Hz through
WebAssembly and Ebitengine.

The browser build keeps locally selected ROMs on the user's device, supports
keyboard and touch controls, streams 44.1 kHz audio, and offers an optional CRT
display treatment. Its release build generates a launcher for bundled ROMs,
ships only an explicit asset allowlist, strips debug data and local paths, and
enforces a compressed WebAssembly size budget.

The hard part is coordination rather than instruction decoding: CPU, PPU, and
APU timing must remain aligned while mapper hardware changes which program and
graphics banks are visible. Small timing errors surface as broken raster
effects, unstable audio, or game-specific compatibility failures.
