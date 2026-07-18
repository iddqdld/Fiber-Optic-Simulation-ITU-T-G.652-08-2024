# Level 1 single-section simulation

`fibre_sim.level1` composes the existing physics models into one JSON result.
The request is one JSON object with nested `preset`, `fibre`,
`source`, `section`, and `sampling` configuration. The nesting keeps related
inputs together while the result exposes each calculated section directly.

## Shared quantities

The engine constructs every subrequest from the validated configuration. The
same refractive indices, core radius, and source wavelength feed guidance; the
explicit mode-field radius and sampling settings feed the Gaussian mode
profile; length and attenuation feed constant loss; length and group index
feed group delay; and length, signed dispersion, source spectrum, and input
pulse width feed chromatic broadening. No Level 1 formula is reimplemented in
the composition layer.

The operating wavelength is shared by all models that accept it. The fibre
configuration also represents one uniform composition over the section. The
mode-field radius is explicit input: this slice does not infer it from the
guidance calculation or silently substitute a different radius.

## Presets and standards

`custom` accepts any positive finite source wavelength and leaves
`standards_checks` without detail checks: its `preset` is `custom`, while
`preset_definition`, `dispersion`, and `attenuation` are all `null`.

`g652d` accepts the inclusive 1260–1625 nm wavelength domain and calls the
existing G.652.D preset, dispersion-envelope/check, and attenuation-check
models with the shared wavelength and supplied coefficients. The standards
checks carry `preset=g652d`, the returned `preset_definition`, and those
existing result types. An attenuation result that is
not applicable produces a Level 1 warning after any guidance warnings, with
the check's exact reason and output field
`standards_checks.attenuation`.

Selecting `g652d` does not replace the supplied refractive indices, core
radius, mode-field radius, or group index. Those quantities are not supplied
as normative G.652.D values and remain explicit simulation inputs.

Guidance warnings retain their original order, message, and output field. They
are tagged with the guidance model ID. A Level 1 warning therefore describes
an unavailable optional output without changing the deterministic calculations
or hiding a standards applicability result.

## Ordering and manifest

The calculation order is guidance, Gaussian mode profile, constant
attenuation, group delay, and chromatic pulse broadening. For `g652d`, the
standards calls then occur in preset, dispersion envelope, dispersion check,
and attenuation check order. `Level1SimulationManifest.component_model_ids`
records the model IDs in exactly that call order. Repeated calculations from
the same request produce equal frozen models and deterministic JSON.

## Assumptions and limits

The manifest records one uniform section, one shared operating wavelength, and
uniform composition. This is a reduced-order educational/first-order slice,
not a full propagation solver. It excludes bends, splices, connectors,
polarization-mode dispersion, optical nonlinearity, multi-section links, and
full-wave field solving. It also does not provide an API or UI; this document
describes only the physics-core composition contract.
