# Constant attenuation

The attenuation request, manifest, and result contracts currently provide
validation only. They do not yet expose the attenuation calculation.

`length_km` is a fibre-section length in kilometres (km). The supplied
`attenuation_db_per_km` is a constant coefficient in decibels per kilometre
(dB/km). `section_loss_db` is a loss in decibels (dB). `input_power_dbm` and
`output_power_dbm` are logarithmic optical-power levels in decibels referenced
to one milliwatt (dBm). Zero length and zero coefficient are valid; loss
remains non-negative, and passive output power cannot exceed input power.

The later constant-section calculation is:

\[
A = \alpha L,
\qquad
P_{out,\,dBm}=P_{in,\,dBm}-A.
\]

With \(\alpha\) in dB/km and \(L\) in km, \(A\) is in dB.

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
