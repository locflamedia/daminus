# Third-party notices

## Technology marks (`src/assets/logos/`)

The SVG marks of Docker, MariaDB, MongoDB, MySQL, NGINX, Node.js, PM2, PostgreSQL and Redis
come from [`@thesvg/icons`](https://thesvg.org) 3.3.12 (the package is MIT licensed,
Copyright (c) 2025 thesvg.org). The marks themselves are trademarks or logos of their owners.
Daminus draws them only to name the technology a project part runs on (a compose project, a
PM2 app, a database engine, a container image), as a label, never to suggest endorsement. They
are bundled with the app, never loaded from the network.

The package does not state a licence for each individual logo. A mark whose owner's terms turn
out not to allow this use is removed by deleting its file and its entry in `src/ui/brand-marks.ts`;
the screens fall back to a coloured dot.

## Fonts (`src/assets/fonts/`)

Geist and Geist Mono (variable, Latin and Vietnamese subsets as woff2) come from the
[Geist project](https://github.com/vercel/geist-font), Copyright 2024 The Geist Project Authors,
via the `@fontsource-variable` packages. They are licensed under the SIL Open Font License,
Version 1.1. The full licence text ships next to the font files in `src/assets/fonts/OFL.txt` and
must stay with them wherever they are redistributed. The fonts are bundled with the app, never
loaded from the network.

## Painting (`assets/brand/`)

The hero image, the DMG background and the app icon use details of *The Starry Night* by
Vincent van Gogh (1889). The work is in the public domain (the artist died in 1890). The images
are derived from a high-resolution scan published on Wikimedia Commons (Google Art Project).
Public-domain status needs no licence; the credit is given here as a courtesy.

The intro samples the same scan into 28,448 coloured dots (`src/assets/intro/starry.json`);
the file holds numbers only, not an image.

## Intro backdrop

The soft drifting-blob and film-grain backdrop of the intro follows the look of the Grainient
background from Vue Bits (David Haz, MIT + Commons Clause). No Vue Bits code is copied or
bundled: the Commons Clause forbids redistributing the components themselves, so the backdrop is
drawn by code written for this project (`src/features/intro/`).

## Flags

The language select draws its flags as small inline SVG shapes written for this project
(`src/ui/flags.ts`). No flag artwork is taken from a third-party package.
