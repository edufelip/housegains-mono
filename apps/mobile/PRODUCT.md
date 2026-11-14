# Product

## Register

**HouseGains** — shared household chores, memberships, and XP ledger.

**Status:** In progress. Product direction and behavior are documented; implementation and production wiring have not been verified here.

## Users

Roommates, couples, and families sharing a household. One creator can set up a household and invite members. Members can contribute to assigned or unassigned chores and earn XP for the subtasks they complete.

## Product purpose

HouseGains gives a household one clear place to organize recurring chores, coordinate responsibility, and see contribution credit. Chore instances preserve their own definitions and completion history so edits to future tasks do not rewrite past work.

## Product principles

- Make membership, assignees, unassigned chores, and completion attribution visible.
- Let any household member help with a chore.
- Award points from unique completion-ledger entries, with an explicit, reversible bonus distribution.
- Keep catalog selections as household-owned copies.
- Label local/demo data and unavailable cross-device behavior honestly.
- Offer a personal choice of three expressive design references without changing shared task data.
- Support en-US, pt-BR, es-ES, fr-FR, de-DE, and it-IT, accessible controls, large text, and reduced motion.

## Appearance references

- **Arcade:** energetic dark quests, electric-lime progress, and compact score presentation.
- **Sticker Pop:** warm, outlined cards, bold color blocks, and playful stickers.
- **Soft Home:** calm pastel surfaces, airy task rows, and a serif heading hierarchy.

These references are three distinct compositions; see [DESIGN.md](DESIGN.md) for their visual detail.

## Core experience

Create or join a household, select catalog chores or build them, invite housemates, choose multiple assignees or leave a chore unassigned, complete subtasks, see the XP ledger, and follow household ranks and completion activity. The creator controls chore-definition changes; those changes affect future instances only.

The active contract is [docs/implementation/housegains-contract.md](../../docs/implementation/housegains-contract.md). Screen IDs and acceptance mapping are in [apps/mobile/docs/screens/housegains-v1.md](docs/screens/housegains-v1.md).
