# Voltaris


Desktop CAD for editing electrical schematics and exploring transient behaviour of selected circuits. Voltaris is an engineering software project focused on an interactive schematic editor, numerical simulation, and explainable calculation output.


> The application is not an AI product and does not require an API key, cloud service, or backend to run.


## Highlights


- Interactive electrical-schematic editor with component palette, orthogonal wiring, rotation, selection, undo/redo, and example circuits.
- Import and export of the human-readable `.scm` format.
- Transient analysis for linear R/L/C circuits with independent sources, using modified nodal analysis (MNA) and backward Euler integration.
- Graphs, signal tables, CSV export, and a standalone HTML calculation report with equations and intermediate values.
- Background Web Workers so a simulation does not block the editor.
- Numerical regression checks for sample circuits, invalid inputs, signal handling, SCM round trips, and analytical RC/RLC references.
- Windows desktop packaging through Electron; development mode is also available through Vite.


## Screenshots


No screenshots are committed yet. Before publishing, capture the editor, a transient plot, and the calculation-report view; place them in `docs/screenshots/` and link them here with descriptive alt text. Do not use diagrams or generated images in place of product screenshots.


## Architecture and stack


| Area | Implementation |
| --- | --- |
| UI | React 19, TypeScript, Tailwind CSS, Lucide |
| Editor | SVG components, orthogonal-wire geometry, editable component properties |
| Simulation | TypeScript MNA solver, backward Euler for linear transient circuits, RK4-based specialised scenarios |
| Responsiveness | Browser Web Workers for calculations and validation |
| Desktop | Electron with context isolation, sandboxed renderer, and limited SCM file IPC |
| Tooling | Vite, TypeScript, tsx checks, electron-builder |


## Run locally


Requirements: Windows for the packaged app and Node.js 22.12 or newer. Development and checks are JavaScript/TypeScript based.


```powershell
npm ci
npm run dev
```


To run the Electron application from source:


```powershell
npm run electron:start
```


## Verify and package


```powershell
npm run lint
npm run test
npm run build
npm run dist:win
```


`npm run dist:win` produces a Windows installer and portable executable in `release/`. Build outputs, dependencies, local environment files, and internal audit notes are intentionally excluded from version control. Continuous integration runs `npm ci`, linting, tests, and the Vite build on Node 22.


## License


Licensed under the [MIT License](LICENSE).
