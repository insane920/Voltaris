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

## Numerical-model scope

Voltaris is an educational and engineering-development tool, not a certified circuit simulator.

- The linear solver supports R/L/C elements and independent sources. It validates common invalid and degenerate circuits, but has practical limits of 20,000 time steps and 160 unknowns.
- Diodes, switches, operational amplifiers, and converter scenarios use simplified, specialised models. Their output is not a universal physical solution for arbitrary topologies.
- The RK4 comparison screen is a control scenario for an idealised rectifier. A passing result does not certify every circuit, operating mode, or component model.
- Validate decisions that affect hardware, safety, compliance, or production designs against an appropriate verified simulator, manufacturer data, and independent engineering review.

The linear transient solver is informed by the [ngspice manual](https://ngspice.sourceforge.io/docs/ngspice-manual.pdf).

## English summary

Voltaris is a TypeScript/Electron portfolio project that combines an SVG circuit editor with numerical transient analysis. It demonstrates desktop application architecture, background computation, modelling trade-offs, file import/export, testable simulation code, and reproducible Windows packaging. It deliberately makes no AI capability claim.

## License

No license has been selected yet. Choose and add a license before creating a public repository; until then, do not assume permission to reuse the source code.
