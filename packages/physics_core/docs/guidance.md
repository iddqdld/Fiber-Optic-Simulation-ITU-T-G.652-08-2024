# Steps 10-15 guidance

Steps 10-15 provide one pure, typed guidance calculation for a valid
`GuidanceRequest`. Step 10 supplies scalar refractive-index quantities; Step 11
adds normalized frequency; Step 12 classifies the ideal-model mode regime; Step
13 adds the large-V mode-count estimate; and Step 14 aggregates those results,
validity warnings, and a model manifest. Steps 14-15 add no endpoint, OpenAPI
schema, or UI.

## Step 10 scalar guidance quantities

The critical angle is

\[
\theta_c = \operatorname{degrees}\left(\arcsin\left(\frac{n_{cladding}}{n_{core}}\right)\right).
\]

It is reported in degrees and measured from the core-cladding normal.

The numerical aperture is dimensionless:

\[
\mathrm{NA} = \sqrt{n_{core}^2 - n_{cladding}^2}.
\]

The air acceptance angle assumes an external medium with refractive index
`n_air = 1`:

\[
\theta_{air} = \operatorname{degrees}(\arcsin(\mathrm{NA})).
\]

The inverse-sine air acceptance-angle model requires `NA <= 1`. For `NA > 1`,
the calculation raises `AirAcceptanceAngleError` with the message
`Inverse-sine air acceptance-angle model requires numerical aperture <= 1.`
This is a domain restriction of this model, not a claim that the physical
acceptance angle is universally undefined.

The project convention for relative index difference is the exact expression

\[
\Delta = \frac{n_{core} - n_{cladding}}{n_{core}}.
\]

The squared-index expression
\[
\Delta \approx \frac{n_{core}^2 - n_{cladding}^2}{2n_{core}^2}
\]
is a weak-guidance approximation and is not the Step 10 project convention.

## Step 11 normalized frequency

The normalized frequency is calculated as

\[
V = \frac{2\pi a}{\lambda}\mathrm{NA}
  = \frac{2\pi a}{\lambda}\sqrt{n_{core}^2 - n_{cladding}^2}.
\]

Here, `a` and `lambda` must use common length units. The request stores the
core radius in micrometres and the wavelength in nanometres, so the calculation
converts them consistently, for example:

\[
a = \mathrm{core\_radius\_um}\times10^{-6}\ \mathrm{m},
\qquad
\lambda = \mathrm{wavelength\_nm}\times10^{-9}\ \mathrm{m}.
\]

The returned V-number is dimensionless. Increasing the core radius, numerical
aperture, or index contrast increases V; increasing the wavelength decreases
V. The equation and the educational reference values used by this step are
documented in section 2.3 of the [authorized local fundamentals note](../../../notes/Fondamentaux%20fibre%20optique%20et%20propagation%20de%20la%20lumi%C3%A8re.md).
That reference is educational and is not a G.652.D value or cable cut-off.

## Step 12 mode-regime classification

Step 12 classifies a valid `GuidanceRequest` using its ideal-model V-number.
`ModeRegime` is a typed `StrEnum` with the stable string values
`"single_mode"` and `"multimode"`. `classify_mode_regime(request)` applies the
following exact branch semantics:

- `V < LP11_CUTOFF_V` returns `ModeRegime.SINGLE_MODE` (`"single_mode"`).
- `V >= LP11_CUTOFF_V` returns `ModeRegime.MULTIMODE` (`"multimode"`).

`LP11_CUTOFF_V` is the rounded value `2.405`. In the ideal circular step-index
weak-guidance model, this is the first positive zero of the Bessel function
`J0` and the LP11 cutoff threshold. The equality case therefore follows the multimode
branch by definition.
This interpretation follows the authorized local [fundamentals note](../../../notes/Fondamentaux%20fibre%20optique%20et%20propagation%20de%20la%20lumi%C3%A8re.md)
and [core theory note](../../../notes/Optical%20Fibre%20Simulator%20-%20Core%20Theory.md).

`SINGLE_MODE` means that only the fundamental LP01 mode is guided in this ideal
model. `MULTIMODE` means that higher-order modes can be guided; it does not
claim that launch conditions excite those modes. LP01 remains present on both
sides of the threshold.

This is an ideal-model regime classification, not a G.652.D conformance check.
The ITU-T G.652.D measured cable cut-off is a distinct specification quantity
whose result depends on fibre, cable, length, bends, and measurement
conditions. It must not be replaced by, or inferred from, the ideal `V = 2.405`
boundary. Step 12 does not provide a theoretical cutoff-wavelength output;
that remains excluded.

## Step 13 asymptotic mode count

For the ideal circular step-index model at large normalized frequency, the
project's asymptotic mode-count estimate uses

\[
M \approx \frac{V^2}{2}.
\]

This is an asymptotic estimate, not exact modal solving and not a G.652.D
conformance result. The project accepts this estimate only for `V >= 10.0`.
That is a conservative project policy for using the large-`V` approximation,
not a universal physical cutoff; values below it raise
`ModeCountValidityError`. The result remains a floating-point, unrounded
value, so non-integer estimates are preserved. The `V^2/2` expression is the
selected project counting convention for this estimate.

## Step 14 aggregate result

`calculate_guidance(request)` returns a frozen `GuidanceResult` with exactly
these explicit output fields:

| Field | Meaning | Nullable? |
|---|---|---:|
| `critical_angle_deg` | Core-to-cladding critical angle in degrees, measured from the normal. | No |
| `numerical_aperture_dimensionless` | Dimensionless ideal step-index numerical aperture. | No |
| `air_acceptance_angle_deg` | Inverse-sine acceptance angle in air, in degrees. | Yes |
| `relative_index_difference_dimensionless` | Exact project convention `(n_core - n_cladding) / n_core`. | No |
| `v_number_dimensionless` | Dimensionless normalized frequency. | No |
| `mode_regime` | `"single_mode"` below `V = 2.405`, otherwise `"multimode"`. | No |
| `approximate_mode_count` | Unrounded `V^2 / 2` estimate when `V >= 10.0`. | Yes |
| `warnings` | Ordered `GuidanceWarning` values describing unavailable submodel outputs. | No |
| `model_manifest` | Frozen `GuidanceModelManifest` describing the model and its policy. | No |

The nullable fields are not zero-valued results. `air_acceptance_angle_deg` is
`null` when the inverse-sine air model is outside its validity domain (`NA >
1`), and `approximate_mode_count` is `null` when the asymptotic estimate is
outside its policy domain (`V < 10.0`). Other valid fields remain populated.

`GuidanceWarningCode` is a typed enumeration with the stable values
`"air_acceptance_angle_unavailable"` and `"mode_count_unavailable"`. Every
warning also carries its original exception text in `message` and the
unavailable output name in `output_field`: `air_acceptance_angle_deg` or
`approximate_mode_count`. If both warnings apply, `warnings` is always ordered
air acceptance first, then mode count. This makes serialized warning arrays
stable and directly actionable.

`GuidanceModelManifest` has stable `model_id =
"ideal_circular_step_index_guidance"` and `model_version = "1.0.0"` values. It
records the exact policy thresholds
`mode_regime_cutoff_v_dimensionless = 2.405` and
`mode_count_min_v_dimensionless = 10.0`. Its assumptions describe an ideal,
circular, step-index, weak-guidance model with the supplied refractive indices
and wavelength. Its limitations explicitly state that the result is not a
G.652.D conformance determination, that it does not use measured cable data,
and that ideal `V` mode cut-off is distinct from—and not equivalent to—the
measured G.652.D cable cut-off.

The warning and manifest collections serialize as deterministic JSON arrays.
The aggregate result is a calculation contract only; this step does not add an
API endpoint, OpenAPI exposure, or frontend/UI integration.

## Step 15 deterministic aggregate boundary coverage

Step 15 adds deterministic public-contract vectors for exact `NA = 1`, the
immediately below/at/above `V = 2.405` regime boundary, and the immediately
below/at/above `V = 10.0` mode-count validity boundary. The vectors use adjacent
floating-point values where needed so strict and inclusive branches are tested
without broad random or property-based coverage. They also cover invalid
request construction, propagation of unrelated submodel errors, and the
closed Pydantic JSON schema: required fields, finite numeric outputs, exact
warning enum values, and number-or-null nullable outputs.

The whole `fibre_sim` package is measured with `pytest-cov 7.1.0` branch
coverage, and the quality gate is an enforced minimum of 90%. At Step 15 the
full package measures 111/111 statements and 8/8 branches, or 100%, with no
missing lines. The focused boundary command is:

```text
uv run --frozen pytest packages/physics_core/tests/guidance/test_boundaries.py
```

The full gate command is:

```text
uv run --frozen pytest --cov=fibre_sim --cov-branch --cov-report=term-missing --cov-fail-under=90
```

Here `--frozen` uses the committed uv lock without resolving or changing
dependencies; the first command runs only the deterministic boundary module,
while the second runs the full configured suite, measures all `fibre_sim`
modules with branch coverage, and fails below the threshold. This step changes
tests, documentation, and quality tooling only; it makes no calculation, API,
OpenAPI, or UI change.

## G.652.D boundary

ITU-T G.652.D specifies mode field diameter (MFD), cladding and transmission,
dispersion, cable cut-off, mechanical, and other fibre/cable limits. It does
not provide canonical values for core radius, `n_core`, `n_cladding`, `NA`, or
a step-index profile. MFD must not be mapped to core diameter, and cable
cut-off is not the ideal step-index `V` cut-off.

Any indices supplied to this module are model assumptions associated with the
chosen wavelength. This module calculates idealized scalar guidance quantities;
it is not a G.652.D conformance check. See the project’s [local ITU-T G.652
note](../../../notes/ITU-g652.md) for the source transcription and scope.

References:

- [MIT OpenCourseWare optical-fibre lecture notes](https://ocw.mit.edu/courses/6-974-fundamentals-of-photonics-quantum-electronics-spring-2006/resources/optical_fibres/)
- [NIST Optical Waveguide Communications Glossary](https://nvlpubs.nist.gov/nistpubs/Legacy/hb/nbshandbook140.pdf)
- [NASA Goddard Chapter 3 fibre acceptance discussion](https://science.gsfc.nasa.gov/671/staff/bios/cs/Nelson_Reginald/Chapter3.pdf)
- [UCF CREOL Integrated Photonics module](https://photonics.creol.ucf.edu/wp-content/uploads/sites/4/2019/06/Integrated_Photonics_2016.pdf)
