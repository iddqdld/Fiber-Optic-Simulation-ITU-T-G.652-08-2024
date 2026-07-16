# Steps 10 and 10A guidance calculations

Step 10 covers the scalar refractive-index guidance calculations for a valid
`GuidanceRequest`. The calculations use the core index `n_core` and cladding
index `n_cladding`; core radius and wavelength are request fields but are not
inputs to these four results. Step 10A makes validated requests immutable,
hardens numerical-aperture evaluation, and declares the G.652.D boundary.

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

This scope excludes the normalized frequency `V`, mode solving, propagation or
other result models, and API or UI behavior.

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
