# Constant attenuation

`calculate_constant_attenuation` evaluates the constant-section model and
returns the existing `ConstantAttenuationResult` with a new
`ConstantAttenuationManifest`:

\[
A = \alpha L,
\qquad
P_{out,\,dBm}=P_{in,\,dBm}-A.
\]

With \(\alpha\) in dB/km and \(L\) in km, \(A\) is in dB. If the computed section
loss compares equal to zero, it is returned as positive `0.0`, including for
zero length, zero coefficient, negative-zero inputs, and underflow. If either
computed output is non-finite for finite-but-extreme request values, the
function raises the public `ConstantAttenuationCalculationError` with exact
message `Constant attenuation calculation produced a non-finite result.`

The result also contains backend-authored `distance_samples_km` and
`power_samples_dbm` series. They are immutable finite tuples in the Python
model and serialize as JSON arrays. The calculator considers 65 evenly
parameterized distance candidates from zero through the section length and
removes repeated floating-point values. Therefore each series contains 1 to
65 paired samples. A zero-length section contains exactly one sample at
distance `0.0` with the input power. A positive-length section starts at exact
distance `0.0`, ends at exact `length_km`, and is strictly increasing in
distance. Power starts at exact `input_power_dbm`, ends at exact
`output_power_dbm`, remains finite, and is non-increasing. The result model
validates these series invariants without independently re-evaluating the
attenuation or power-balance formulas.

`length_km` is a fibre-section length in kilometres (km). The supplied
`attenuation_db_per_km` is a constant coefficient in decibels per kilometre
(dB/km). `section_loss_db` is a loss in decibels (dB). `input_power_dbm` and
`output_power_dbm` are logarithmic optical-power levels in decibels referenced
to one milliwatt (dBm). Zero length and zero coefficient are valid; loss
remains non-negative, and passive output power cannot exceed input power.

Losses in dB are additive. dBm is a logarithmic power level, so dBm powers
must not be added directly when combining optical powers; convert to linear
power first.

The coefficient is supplied for this model and is wavelength-independent. It
is not inferred from wavelength or material, and it is not evidence of G.652
conformance or typical performance. Splice, connector, bend, and
engineering-margin losses are excluded.

These distinctions follow the authorized [core theory note](../../../notes/Optical%20Fibre%20Simulator%20-%20Core%20Theory.md),
[fundamentals note](../../../notes/Fondamentaux%20fibre%20optique%20et%20propagation%20de%20la%20lumi%C3%A8re.md),
and [ITU-T G.652 note](../../../notes/ITU-g652.md).
