# Gaussian mode field and radius

The Gaussian sampler uses the field convention

\[
E(r)=\exp(-r^2/w^2),
\qquad
I(r)=\exp(-2r^2/w^2).
\]

Thus `w` is the 1/e field radius and the 1/e² intensity radius, and the
Gaussian mode-field diameter is `MFD = 2w`. The
`approximate_mode_field_radius_um` output is this `w` in micrometres.

For an ideal circular step-index fibre, the Marcuse empirical fit is

\[
\frac{w}{a}=0.65+\frac{1.619}{V^{3/2}}+\frac{2.879}{V^6},
\]

where `a` is the core radius and `V` is the normalized frequency. This project
uses the inclusive validity policy `1.2 <= V <= 2.4`; values outside it raise
`ModeFieldRadiusValidityError`. This is an empirical approximation, not an
exact eigenmode solution.

The policy interval is distinct from the ideal LP11 cutoff `V ≈ 2.405`, which
belongs to mode-regime classification. It is also distinct from measured or
conformance `G.652.D` mode-field diameter: that standard quantity is not inferred
from this step-index fit, and this function is not a G.652 conformance check.

References: the authorized [local fundamentals note](../../../notes/Fondamentaux%20fibre%20optique%20et%20propagation%20de%20la%20lumi%C3%A8re.md),
[D. Marcuse's original paper](https://doi.org/10.1002/j.1538-7305.1977.tb00534.x),
and the [2022 Optics Express paper](https://doi.org/10.1364/OE.447591).
