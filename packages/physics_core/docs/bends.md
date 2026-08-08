# Marcuse LP01 macrobend loss

`calculate_marcuse_bend_loss` calculates constant-curvature radiation loss for the scalar LP01 mode of an equivalent weakly guiding step-index fibre.

The function uses SI units. It receives the wavelength, core radius, refractive indices, propagation constant, and physical bend radius.

The power attenuation coefficient is

\[
\alpha_{\mathrm p}=
\frac{\sqrt{\pi}\,\kappa^2}
{2\,\gamma^{3/2}V^2\sqrt{R}\,[K_1(\gamma a)]^2}
\exp\left[-\frac{2}{3}\frac{\gamma^3}{\beta^2}R\right].
\]

The model evaluates this expression in the log domain. A scaled `K1` Bessel function prevents loss of numeric range.

`calculate_macrobend_loss` applies the model to configured circular arcs. Each arc has physical length \(R|\theta|\).

The total estimated loss is

\[
A_{\mathrm{bend,dB}}=
\frac{10}{\ln 10}\sum_i \alpha_{\mathrm p}(R_i)R_i|\theta_i|.
\]

The existing propagation constant has priority. If it is absent, the module solves the scalar LP01 step-index characteristic equation.

`integrate_local_curvature_marcuse` accepts sampled three-dimensional SI coordinates. It applies the same model through a local-curvature trapezoidal integral.

This path result is an engineering estimate. Abrupt curvature transitions can add mode mismatch that the integral does not include.

The geometry guard uses the physical cladding radius when it is available. It reports a warning or `outside_model_validity` for very small bend radii.

The model excludes coatings, cable structures, microbends, polarization coupling, stress-optic coupling, and full-vector bent modes.

The result is not measured manufacturer data. It is not a G.652 compliance certificate.
