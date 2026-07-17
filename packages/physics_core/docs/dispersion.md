# Group delay

The package calculates deterministic group delay with
`calculate_group_delay`.

Group velocity is the speed of an optical signal envelope or modulation. The
group index is the supplied dimensionless index associated with that velocity:

\[
v_g = \frac{c}{n_g},
\qquad
t_g = \frac{n_g L}{c}.
\]

The calculation is exactly:

`group_delay_ps = group_index_dimensionless * length_km * 1_000.0 / 299792458.0 * 1e12`

This converts kilometres to metres and seconds to picoseconds while using the
exact SI vacuum speed `299792458 m/s`. `group_index_dimensionless` is
dimensionless and supplied by the caller. If the computed delay compares equal
to zero, including zero length, negative zero, or positive underflow, it is
returned as positive `0.0`. Finite inputs whose result is non-finite raise the
typed `GroupDelayCalculationError`.

Group velocity and group delay describe signal-envelope propagation; phase
velocity and phase delay describe carrier-phase propagation and are distinct
quantities. Deterministic propagation group delay is also distinct from
chromatic pulse broadening and polarization-mode dispersion (PMD), including
differential group delay (DGD).

This model uses a constant group index supplied by the caller. It is not
derived from a wavelength-dependent effective index and is not a G.652
group-delay fit or conformance check. A real 1 km fibre-section delay is on the
order of microseconds, so an animation will require scaled time; this package
does not provide frontend timing behavior.

# First-order chromatic pulse broadening

The package exposes frozen, extra-forbid request, manifest, and result
contracts for first-order chromatic pulse broadening, and calculates the
broadening with `calculate_chromatic_pulse_broadening`.

The calculation uses signed accumulated dispersion
`D_acc = D * L` in ps/nm, dispersion broadening magnitude
`DeltaT = abs(D_acc) * Delta-lambda_FWHM` in ps, and
`T_out = hypot(T_in, DeltaT)`. `math.hypot` provides numerically stable
quadrature for the output pulse width. Both the source spectral width and
pulse widths use FWHM. They must not be mixed with RMS widths without
conversion.

Zero length, zero supplied dispersion, or zero source spectral width produces
zero chromatic broadening and leaves the input pulse width unchanged. The sign
of `D` is retained in accumulated dispersion for dispersion and arrival/chirp
interpretation, while pulse-width broadening uses its magnitude. Any
non-finite accumulated dispersion, broadening, or output width raises the
typed `ChromaticPulseBroadeningCalculationError` with the stable message
`Chromatic pulse broadening calculation produced a non-finite result.`

The coefficient `D` is supplied as constant over the fibre section at the
operating wavelength; it is not derived from wavelength. This scope excludes
full pulse propagation, initial chirp, higher-order dispersion, nonlinearity,
PMD, and any G.652 fit or conformance model.

The scope follows the authorized [core theory note](../../../notes/Optical%20Fibre%20Simulator%20-%20Core%20Theory.md),
[fundamentals note](../../../notes/Fondamentaux%20fibre%20optique%20et%20propagation%20de%20la%20lumi%C3%A8re.md),
and [ITU-T G.652 note](../../../notes/ITU-g652.md).
