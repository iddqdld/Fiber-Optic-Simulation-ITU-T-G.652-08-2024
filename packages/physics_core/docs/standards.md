# G.652.D chromatic-dispersion envelope

This package provides contracts for a G.652.D chromatic-dispersion envelope.
It is a standards-boundary model: the manifest records the standard metadata,
coefficients, equations, assumptions, and limitations, while the result
contract carries signed minimum and maximum dispersion bounds. This Step 27
slice does not provide a calculation function; calculation is deferred until
Step 28 in the [development plan](../../../notes/Optical-Fibre-Simulator-Development-Plan.md).

The source is ITU-T G.652 (08/2024), clause 6.10 and Table 2, as represented by
the authorized [local ITU note](../../../notes/ITU-g652.md). Wavelengths are in
nm. Dispersion is in ps/(nm·km), and zero-dispersion slope is in
ps/(nm²·km). The envelope domain is inclusive:

`1260 nm <= wavelength <= 1625 nm`

## Boundary equations

Let \(D(\lambda)\) be the signed chromatic-dispersion coefficient, with
\(\lambda\) in nm. The zero-dispersion wavelengths and slopes are:

\[
\lambda_{0\min}=1300\ \mathrm{nm},\qquad
\lambda_{0\max}=1324\ \mathrm{nm},
\]

\[
S_{0\min}=0.073\ \mathrm{ps/(nm^2\,km)},\qquad
S_{0\max}=0.092\ \mathrm{ps/(nm^2\,km)}.
\]

For the 1260-1460 nm region, the published three-term Sellmeier boundary
forms are:

\[
\frac{\lambda S_{0\max}}{4}
\left[1-\left(\frac{\lambda_{0\max}}{\lambda}\right)^4\right]
\le D(\lambda) \le
\frac{\lambda S_{0\min}}{4}
\left[1-\left(\frac{\lambda_{0\min}}{\lambda}\right)^4\right],
\qquad \lambda\le\lambda_{0\min}
\tag{6-2a}
\]

\[
\frac{\lambda S_{0\max}}{4}
\left[1-\left(\frac{\lambda_{0\max}}{\lambda}\right)^4\right]
\le D(\lambda) \le
\frac{\lambda S_{0\max}}{4}
\left[1-\left(\frac{\lambda_{0\min}}{\lambda}\right)^4\right],
\qquad \lambda_{0\min}\le\lambda\le\lambda_{0\max}
\tag{6-2b}
\]

\[
\frac{\lambda S_{0\min}}{4}
\left[1-\left(\frac{\lambda_{0\max}}{\lambda}\right)^4\right]
\le D(\lambda) \le
\frac{\lambda S_{0\max}}{4}
\left[1-\left(\frac{\lambda_{0\min}}{\lambda}\right)^4\right],
\qquad \lambda_{0\max}\le\lambda
\tag{6-2c}
\]

For the 1460-1625 nm region, the published linear boundary form is:

\[
8.625+0.052(\lambda-1460)
\le D(\lambda) \le
12.472+0.068(\lambda-1460)
\tag{6-3}
\]

The lower linear intercept and slope are 8.625 ps/(nm·km) and
0.052 ps/(nm²·km). The upper linear intercept and slope are 12.472
ps/(nm·km) and 0.068 ps/(nm²·km). The bounds are signed; they are not
absolute-dispersion magnitudes.

The published regions share the 1460 nm boundary. This package assigns that
boundary to the `linear` fit region, so the three-term Sellmeier region is
used below 1460 nm and the linear region is used from 1460 nm through 1625
nm, deterministically.

## Scope and limitations

The request contract validates only a finite wavelength in the inclusive
1260-1625 nm domain. The result contract validates finite signed bounds and
rejects only a minimum bound greater than its maximum bound. It does not
cross-validate equations, fit region, wavelength, manifest coefficients, or
equality at the bounds.

The envelope bounds are not a nominal or measured product dispersion curve.
Envelope evaluation alone is not complete G.652.D conformance. This contract
slice excludes longitudinal variation, statistical link design,
multi-section accumulation, pulse broadening, and group delay. No numerical
calculation is implemented until Step 28.
