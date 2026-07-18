# G.652.D chromatic-dispersion envelope

The `fibre_sim.standards` package evaluates the published ITU-T G.652.D
chromatic-dispersion coefficient envelope with
`calculate_g652d_dispersion_envelope`. The request domain is inclusive and
bounded:

`1260 nm <= wavelength <= 1625 nm`

Wavelength is in nm. The returned signed minimum and maximum dispersion
values are in ps/(nm·km). Zero-dispersion slope is in ps/(nm²·km). Each
calculation returns the request wavelength unchanged, the selected fit region,
and a fresh `G652DDispersionEnvelopeManifest`.

The source is ITU-T G.652 (08/2024), clause 6.10 and Table 2, as represented by
the authorized [local ITU note](../../../notes/ITU-g652.md).

## Published boundary equations

Let D(lambda) be the signed chromatic-dispersion coefficient. Define the
published three-term Sellmeier boundary form:

\[
B(\lambda;\lambda_0,S_0) =
\frac{\lambda S_0}{4}\left[1-\left(\frac{\lambda_0}{\lambda}\right)^4\right].
\]

The constants are:

\[
\lambda_{0\min}=1300\ \mathrm{nm},\qquad
\lambda_{0\max}=1324\ \mathrm{nm},
\]

\[
S_{0\min}=0.073\ \mathrm{ps/(nm^2\,km)},\qquad
S_{0\max}=0.092\ \mathrm{ps/(nm^2\,km)}.
\]

The evaluator owns every branch boundary as follows:

| Wavelength interval | Equation | Minimum | Maximum |
| --- | --- | --- | --- |
| `1260 <= wavelength < 1300` | 6-2a | `B(wavelength; lambda0max, S0max)` | `B(wavelength; lambda0min, S0min)` |
| `1300 <= wavelength < 1324` | 6-2b | `B(wavelength; lambda0max, S0max)` | `B(wavelength; lambda0min, S0max)` |
| `1324 <= wavelength < 1460` | 6-2c | `B(wavelength; lambda0max, S0min)` | `B(wavelength; lambda0min, S0max)` |
| `1460 <= wavelength <= 1625` | 6-3 | `8.625 + 0.052 * (wavelength - 1460)` | `12.472 + 0.068 * (wavelength - 1460)` |

Thus, equation 6-2a is half-open at 1300 nm, 6-2b is half-open at 1324
nm, 6-2c is half-open at 1460 nm, and equation 6-3 owns 1460 nm. The fit
region is `three_term_sellmeier` for all wavelengths below 1460 nm and
`linear` from 1460 nm onward.

## Analytical examples

The following values show the signed envelope returned by the evaluator;
displayed decimals are for readability.

| Wavelength (nm) | Equation | Minimum (ps/(nm·km)) | Maximum (ps/(nm·km)) |
| ---: | --- | ---: | ---: |
| 1260 | 6-2a | -6.351993436 | -3.062013781 |
| 1300 | 6-2b | -2.269900638 | 0 |
| 1324 | 6-2c | 0 | 2.148685972 |
| 1460 | 6-3 | 8.625 | 12.472 |
| 1550 | 6-3 | 13.305 | 18.592 |
| 1625 | 6-3 | 17.205 | 23.692 |

At the shared transition, evaluating 6-2c analytically at 1460 nm gives
approximately `8.624939619` and `12.472214222`. The chosen 6-3 branch gives
exactly `8.625` and `12.472` because its published coefficients are rounded.
This tiny transition mismatch is the defined consequence of the branch
ownership and rounded linear coefficients; it is not hidden or treated as a
numerical error.

The bounds are signed values, not absolute-dispersion magnitudes. Negative,
zero, and positive results are all valid where produced by the published
equations.

## Dispersion check

`check_g652d_dispersion` is a pure check for the explicit G.652.D preset.
`G652DDispersionCheckRequest` carries an inclusive-domain wavelength and a
finite, signed supplied chromatic-dispersion coefficient, both in the units
described above. The check constructs a
`G652DDispersionEnvelopeRequest` from exactly that wavelength and reuses
`calculate_g652d_dispersion_envelope`; it does not duplicate the envelope
equations or constants.

`G652DDispersionCheckResult` carries the wavelength, supplied coefficient,
selected fit region, envelope minimum and maximum, two signed margins, a
status, and a fresh `G652DDispersionCheckManifest`. The wavelength and
supplied signed coefficient are preserved, and the fit region and envelope
bounds are carried through unchanged. No check-specific error type is used:
the finite validated request and bounded envelope produce finite result
values, including for finite floating-point coefficient extremes.

The check computes its values in this exact order:

1. Evaluate the envelope at the request wavelength.
2. Compute the margins:

   ```text
   margin_above_minimum = supplied_dispersion - minimum_dispersion
   margin_below_maximum = maximum_dispersion - supplied_dispersion
   ```

3. If either computed margin compares equal to `0.0`, replace it with
   positive `0.0`.
4. Compare the supplied coefficient exactly: if it is less than the minimum,
   return `fail_below_minimum`; otherwise, if it is greater than the maximum,
   return `fail_above_maximum`; otherwise, return `pass`.

No tolerance or rounding is applied. Exact equality with either boundary
passes inclusively. Both margins are non-negative inside the envelope; a
negative `margin_above_minimum` identifies a value below the minimum, and a
negative `margin_below_maximum` identifies a value above the maximum.

The statuses are `pass`, `fail_below_minimum`, and `fail_above_maximum`.
The failure statuses are directional and identify the violated lower or upper
boundary. Preset mismatch or absence is handled by the caller and must not be
reported as a pass.

## Attenuation check

`check_g652d_attenuation` is a pure represented check of the G.652.D cable
attenuation coefficient. `G652DAttenuationCheckRequest` requires a finite,
non-negative coefficient, a required cable application, and an inclusive
wavelength domain:

`1260 nm <= wavelength <= 1625 nm`

Only `standard_cable` is applicable. `short_jumper`, `indoor_cable`, and
`drop_cable` always return `not_applicable` because the Table 2 attenuation
values are excluded for those contexts. A standard-cable request below 1310 nm
also returns `not_applicable`: Table 2's direct broad attenuation limit begins
at 1310 nm. The Table 2 note permits extending the lower end to 1260 nm by
adding `+0.07 dB/km` to a 1310 nm attenuation value, but this checker does not
infer a 1260-1310 nm result from that note; it requires a measured 1310 nm
value for the direct check.

For applicable standard-cable requests, the limit bands are inclusive and
owned exactly as follows:

| Wavelength interval | Limit band | Maximum attenuation |
| --- | --- | ---: |
| `1310 <= wavelength < 1530` or `1565 < wavelength <= 1625` | `general_1310_1625` | `0.40 dB/km` |
| `1530 <= wavelength <= 1565` | `c_band_1530_1565` | `0.30 dB/km` |

The C-band value overrides the general value on both shared boundaries. A
supplied value equal to the maximum passes. The result margin is
`maximum - supplied`; it is signed, and an exact zero is normalized to
positive zero. The statuses are `pass`, `fail_above_maximum`, and
`not_applicable`. A not-applicable result omits all comparison fields and
provides a nonblank reason.

## G.652.D preset

`get_g652d_preset()` returns a fresh deterministic `G652DPreset` for
`g652d_2024`. Its `G652DStandardLimits` object is separate from its
`G652DSimulationDefaults` object. The limits encode the Table 2 values for
mode-field diameter, cladding, core concentricity, cladding non-circularity,
cable cut-off, macrobending, proof stress, the nested dispersion-envelope
manifest, the general and C-band attenuation limits, hydrogen-aged
attenuation, and PMD. Its source reference is exactly
`ITU-T G.652 (08/2024), Table 2`.

The simulation defaults encode the informative Appendix I Table I.1 example:
1550 nm, `0.275 dB/km`, and `17 ps/(nm·km)`. Their source reference is exactly
`ITU-T G.652 (08/2024), Appendix I, Table I.1`; they are not normative limits
or a product guarantee and do not supply core radius, refractive indices, or
group index. Preset source references, assumptions, and limitations are
serialized as immutable tuples.

The preset is source-rich data, not a full conformance engine. The attenuation
check consumes only the supplied wavelength, attenuation coefficient, and
cable application. The encoded geometrical, mechanical, hydrogen-ageing,
dispersion, and PMD attributes are available for downstream work but are not
individually checked by this slice. Hydrogen ageing is a type test and is not
inferred from an unaged attenuation value. A passing attenuation or dispersion
check is not full G.652.D conformance. The MFD nominal range and tolerance must
not be combined into a direct measured-value envelope without a specified
product nominal; the macrobend value is a qualification condition rather than
a universal continuous bend-loss equation; and the PMD value is statistical,
not deterministic group delay.

## Scope and limitations

This implementation evaluates the dispersion envelope, attenuation bands, and
their pure checks only.
It is not a nominal or measurement model and is not complete G.652.D
conformance. It does not cover statistical link design, multi-section
accumulation, pulse broadening, group delay, an API, or a frontend.
Longitudinal variation and other system-level effects are outside this slice.
The check also does not establish complete G.652.D conformance: its supplied
coefficient is accepted as input rather than measured or independently
validated, and it excludes measurement uncertainty, longitudinal variation,
statistical link design, and other fibre attributes.
