---
title: NES Emulator
blurb: >-
  Cycle-accurate Nintendo Entertainment System emulator written from scratch in C.
stack: [C, Systems Programming, Emulation]
repo: https://github.com/akap-hub/nes-emu
featured: true
order: 3
---

A low-level Nintendo Entertainment System emulator developed in C, implementing
the 6502 CPU instruction set, PPU graphics processing, and APU sound synthesis
with cycle-accurate timing and memory mapping.

The interesting constraint in NES emulation is that games depend on hardware
timing quirks rather than documented behaviour — the PPU and CPU run on a fixed
clock ratio, and any title using mid-scanline raster effects will render
incorrectly if that relationship drifts. Getting the memory mapper and the
PPU/CPU interleave right is most of the work; the instruction set itself is the
easy part.
