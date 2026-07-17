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

## Scope and limitations

This implementation evaluates the envelope only. It is not a nominal or
measurement model and is not complete G.652.D conformance. It does not cover
statistical link design, multi-section accumulation, pulse broadening, group
delay, an API, or a frontend. Longitudinal variation and other system-level
effects are outside this slice.
