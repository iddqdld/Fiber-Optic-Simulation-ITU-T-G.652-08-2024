# Steps 10-12 guidance

Step 11 adds the normalized frequency, or V-number, calculation for a valid
`GuidanceRequest`. It builds on the scalar refractive-index guidance quantities
from Steps 10 and 10A. Unlike those earlier quantities, V depends on all four
request fields: `n_core` and `n_cladding` through the numerical aperture,
`core_radius_um` through the core radius, and `wavelength_nm` through the
wavelength.

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
boundary. Step 12 does not provide a mode count or a theoretical
cutoff-wavelength output; both remain excluded.

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
