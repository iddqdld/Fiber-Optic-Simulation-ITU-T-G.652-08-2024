# Step 10 guidance calculations

Step 10 covers the scalar refractive-index guidance calculations for a valid
`GuidanceRequest`. The calculations use the core index `n_core` and cladding
index `n_cladding`; core radius and wavelength are request fields but are not
inputs to these four results.

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

If `NA > 1`, the air acceptance angle is undefined and the calculation raises
`AirAcceptanceAngleError` with the message `Air acceptance angle is undefined when numerical aperture exceeds 1.`

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

References:

- [MIT OpenCourseWare optical-fibre lecture notes](https://ocw.mit.edu/courses/6-974-fundamentals-of-photonics-quantum-electronics-spring-2006/resources/optical_fibres/)
- [NIST Optical Waveguide Communications Glossary](https://nvlpubs.nist.gov/nistpubs/Legacy/hb/nbshandbook140.pdf)
- [NASA Goddard Chapter 3 fibre acceptance discussion](https://science.gsfc.nasa.gov/671/staff/bios/cs/Nelson_Reginald/Chapter3.pdf)
- [UCF CREOL Integrated Photonics module](https://photonics.creol.ucf.edu/wp-content/uploads/sites/4/2019/06/Integrated_Photonics_2016.pdf)
