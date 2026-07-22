# User-supplied macrobend loss

`calculate_macrobend_loss` aggregates the losses supplied for an ordered tuple
of macrobends. It does not derive loss from bend geometry or from an optical
fibre model.

The units are:

- `position_fraction`: dimensionless, inclusive from 0 to 1;
- `radius_mm`: bend radius in millimetres (mm);
- `angle_deg`: bend angle in degrees (deg), greater than 0 and at most 360;
- `supplied_loss_db` and `cumulative_bend_loss_db`: loss in decibels (dB);
- `input_power_dbm`, point `output_power_dbm`, and result `output_power_dbm`:
  optical power levels in decibels referenced to one milliwatt (dBm).

For bends in the provided propagation order, the calculation is

\[
A_{\mathrm{bends}} = \sum_i A_i,
\qquad
P_{\mathrm{out,dBm}} = P_{\mathrm{in,dBm}} - A_{\mathrm{bends}}.
\]

Each result bend echoes the bend metadata, records cumulative loss through
that bend, and records the corresponding output power. Zero computed loss is
represented as positive `0.0`. The request and result `bends` accept at most
`MAX_MACROBENDS = 32` entries. Positions must be strictly increasing in the
provided propagation order, and the model enforces passive, ordered,
non-decreasing cumulative loss and non-increasing point power.

The selected policy is explicit user-supplied additive loss: each supplied
loss is treated as passive, bends are ordered, and losses are added in dB.
Radius, angle, and position do not derive loss. There is no wavelength, MFD,
index, or radiation model in this package. This is not the G.652 qualification
test or a G.652 conformance model.

The model is valid for finite numeric inputs that satisfy the stated bounds
and for aggregation results that remain finite. It intentionally defers
empirical macrobend-loss curves, wavelength and mode-field dependence,
refractive-index and radiation modelling, uncertainty treatment, and any
standards qualification or conformance work.
