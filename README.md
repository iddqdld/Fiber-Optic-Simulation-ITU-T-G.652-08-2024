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

- **Enhanced 3D showcase** — curved fibre routes, camera presets, clearer materials, scale markers, layer controls, and spatial power/pulse indicators.
- **Bends and loss visualization** — configurable macrobends with backend-calculated loss and clearly labelled leakage hotspots.
- **Configuration comparison** — baseline and variant inputs with result differences, overlaid plots, and visual comparison.
- **Parameter sweeps** — explore one changing parameter across a safe range and graph its effect on selected outputs.
- **Multi-section links** — assemble ordered cable sections, splices, and connectors with per-component result breakdowns.
- **Level 2 models** — wavelength-dependent loss and dispersion, splice coupling, PMD/DGD estimates, and statistical studies.
- **Project exchange** — save, reopen, import, and export reproducible simulations and results as JSON or CSV.
