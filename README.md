# Fiber-Optic-Simulation-ITU-T-G.652-08-2024

An application for 3D simulation of G-652 standard fiber-optic cable parameters, with the ability to visualize changes in any parameters.

```bash
make dev  # Start at http://localhost:5173
make down # Stop
```

mark with : feature/nickname in readme to show who works on what feature. 

as now more than 1 person works on the code, let's write features properly from the main/featurename branch frok. 

pls test before push bla bla bla

## Remaining features

- **Frontend architecture refactor** — extract preview handling, validation, and workspace composition from `App.tsx` into focused modules and hooks.
- **Enhanced 3D showcase** — curved fibre routes, camera presets, clearer materials, scale markers, layer controls, and spatial power/pulse indicators.
- ~~**Bends and loss visualization** — configurable macrobends with backend-calculated loss and clearly labelled leakage hotspots.~~
- ~~**Configuration comparison** — baseline and variant inputs with result differences, overlaid plots, and visual comparison.~~ 
- ~~**Parameter sweeps** — explore one changing parameter across a safe range and graph its effect on selected outputs.~~ 
- **Multi-section links** — assemble ordered cable sections, splices, and connectors with per-component result breakdowns.
- **Level 2 models** — wavelength-dependent loss and dispersion, splice coupling, PMD/DGD estimates, and statistical studies.
- ~~**Import and export** — exchange portable simulation configurations and results as JSON or CSV without accounts or server-side projects.~~ : feature/import-export
# Step 1 fixes
- **3D mode-regime visibility** — show the calculated single-mode or multimode state, current V-number, and ideal `V = 2.405` boundary clearly beside the 3D viewport.
- **Single-mode electromagnetic field view** — improve the 3D field representation and clearly distinguish the current scalar LP01 intensity approximation from a complete electromagnetic field solution.
- **Multimode field visualization** — calculate and display supported higher-order mode fields when the parameters enter the multimode regime, while keeping supported modes separate from modes actually excited by a source.
- **Bend physics and 3D integration** — complete geometry-based bend calculations and make the educational ray, scaled pulse animation, field layers, and leakage indicators follow the curved fibre route correctly.


