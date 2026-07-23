---
title: Ethereum BlockChat
blurb: >-
  A messaging demo on a local Ethereum chain — direct messages, broadcasts, and
  groups, with no wallet extension, testnet funds, or hosted RPC.
stack: [Solidity, Hardhat, Ethers.js, JavaScript]
repo: https://github.com/hotpath-hooligan/ethereum_blockchat
order: 3
---

BlockChat is a Solidity contract and browser interface for exchanging messages
through an Ethereum chain. One command starts an ephemeral Hardhat Network,
compiles and deploys the contract, and serves the UI with ten deterministic
development accounts already funded and unlocked — so the whole thing runs with
no MetaMask, no testnet faucet, and no external RPC provider.

On-chain it supports account registration with a directory of registered
accounts, direct messages, and multi-recipient broadcasts. Groups are
deliberately *not* on-chain: the membership list lives in browser
`localStorage` and only the resulting messages hit the contract, which keeps
group management free and mutable while the message history stays verifiable.
Contract behaviour is covered by an integration suite that runs against a
temporary chain.

The interface is intentionally boring in the right places — click-to-reply inbox
rows, separate direct and group inboxes, account switching without a wallet, no
browser CDN dependencies. It is a demonstration, not a private messenger:
messages are stored as plaintext on the local blockchain, and the README says so
before it says anything else.
