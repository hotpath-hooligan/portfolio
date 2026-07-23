---
title: Yocto OS
blurb: >-
  A small educational 32-bit x86 kernel with interrupt-driven input, a VGA
  terminal, serial diagnostics, and an allocation-free command prompt.
stack: [C, x86 Assembly, Operating Systems, QEMU]
repo: https://github.com/hotpath-hooligan/yocto_os
order: 6
---

Yocto OS is a small 32-bit x86 kernel written in C and assembly. It boots through
GRUB's Multiboot 1 protocol, enters protected mode with its own GDT and IDT,
remaps the 8259 PIC, handles PS/2 keyboard interrupts, and provides VGA text and
COM1 serial output. Despite the name, it is unrelated to the Linux-focused Yocto
Project.

The kernel exposes a basic allocation-free command prompt with editing, screen
scrolling, hardware-cursor updates, and commands for help, output, clearing, and
rebooting. An idle loop uses `hlt` so the processor waits for interrupts instead
of spinning. The Makefile can produce a bootable ISO and run it under QEMU with
serial logs for debugging.

Its scope is deliberately explicit: it does not yet implement processes,
filesystems, networking, graphics, USB, UEFI, or user mode. The project is about
learning the early machine boundary—boot layout, descriptor tables, interrupt
entry, device I/O, and the places where C and assembly must agree exactly.
