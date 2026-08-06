STEP 2 PANDA TWO-DIMENSIONAL SIMULATION

  

PURPOSE

  

Step 2 adds a PANDA fibre simulation to the application. PANDA means that two Stress Applying Parts, or SAPs, create controlled stress near the fibre core. This stress changes the optical properties of the glass. The module uses a two-dimensional cross-section. It does not use a three-dimensional model.

  

The module has two main displays. The first display follows Figure 5.1 and shows a fast analytical field pattern. The second display follows Figure 9.1 and shows a quantitative Finite Element Method, or FEM, solution. The two displays use the same geometry. They do not make the same scientific claims.

  

USER VIEW

  

The main navigation has separate G.652 and PANDA modules. The PANDA module has a Field map tab and a FEM mesh tab. Each tab uses the same application layout. The left side contains inputs. The centre contains the two-dimensional display. The right side contains results, warnings, assumptions, and limits.

  

The Field map tab helps the user see the effect of SAP position, SAP size, thermal mismatch, and symmetry. The FEM mesh tab helps the user examine the mesh, displacement, stress, local material birefringence, optical-axis direction, force balance, and convergence.

  

DATA FOUNDATION

  

The code defines the core, cladding, SAP 1, and SAP 2 as separate regions. It keeps the two SAPs independent. This design supports symmetric and asymmetric PANDA fibres.

  

All physics inputs use SI units. The material records include Young's modulus, Poisson's ratio, coefficient of thermal expansion, refractive index, and photoelastic coefficients. Each record also contains its source and confidence level. The current default data is demonstration data. It is not manufacturer data.

  

Strict validation rejects invalid geometry, incomplete material records, mixed photoelastic conventions, and unsupported load combinations. The API publishes the same rules through OpenAPI. The React frontend also checks each returned field before it shows a result.

  

FIGURE 5.1 FIELD MAP

  

The Figure 5.1 engine calculates a signed deviatoric-difference kernel. For each SAP, it uses coordinates that are relative to the SAP centre. The main field has this form:

  

$D(x,y)=\sum_i 2\eta_i R_i^2\frac{(x-x_i)^2-(y-y_i)^2}{\left((x-x_i)^2+(y-y_i)^2\right)^2}$

  

The value is proportional to \(\sigma_{xx}-\sigma_{yy}\). Here, \(\eta_i\) is the thermal mismatch amplitude. The value \(R_i\) is the SAP radius. The values \(x_i\) and \(y_i\) give the SAP centre.

  

The code calculates the raw field before it applies a mask. The mask removes SAP interiors, the selected interface buffer, and points outside the cladding. The code normalizes the remaining values as follows:

  



$\widehat{D}(x,y)=\frac{D(x,y)}{\max_{\Omega_{\mathrm{valid}}}|D|}$


  

The source material does not define the coefficient that would give an absolute stress scale. For this reason, the display is dimensionless. It does not show Pa or MPa. It shows the field shape and sign only.

  

The interactive grid uses 401 by 401 samples. A 601 by 601 option gives more detail. Filled contours hide the grid cells. Thin isolines show the field structure, including the zero contour. A separate hatch shows invalid regions. The validity-aware mode shows the physical mask. The reference-replica mode supports visual comparison with Figure 5.1.

  

The code compresses API responses and caches contour work. It also stores the masks as vector paths. These controls reduce memory use and redraw time.

  

FIGURE 9.1 MESH AND FEM

  

The mesh engine uses Triangle and scikit-fem. It creates triangles that follow the core and SAP interfaces. Every triangle has a core, cladding, SAP 1, or SAP 2 region tag. The user can select Preview, Standard, or Fine refinement. The application reports node count, element count, interface count, minimum angle, and mesh quality.

  

The FEM solver uses generalized plane strain. This model calculates transverse displacement and uses one uniform axial strain value for the complete cross-section. Each material has its own thermal contraction:

  



$\boldsymbol{\varepsilon}^{\mathrm{th}}_r=\alpha_r(T-T_f)\mathbf{I}$



  

The material stress is:

  



$\boldsymbol{\sigma}_r=\mathbf{C}_r:\left(\boldsymbol{\varepsilon}^{\mathrm{GPS}}-\boldsymbol{\varepsilon}^{\mathrm{th}}_r\right)$


  

The exterior boundary is free. Small controlled anchors remove rigid movement without fixing the outer glass. The solver supports a free axial resultant, a prescribed axial force, and a prescribed axial strain. The free condition uses:


$\int_{\Omega}\sigma_{zz}\,dA=0$


The solver returns displacement, strain, Cauchy stress, principal stress, principal-axis direction, anchor reactions, and force-balance data. It repeats the solve on refinement levels to report convergence. The calculation starts only when the user selects Calculate FEM. This action prevents unnecessary work on computers with limited memory.

  

PHOTOELASTICITY

  

Step 2.7 converts the validated FEM stress into local material birefringence. The code supports one selected photoelastic convention for each material. For strain-optic coefficients, it calculates the stress-optic coefficient as follows:


$C_{\sigma}=\frac{n^3(1+\nu)(p_{12}-p_{11})}{2E}$


  

For stress-optic coefficients, it uses:

  



$C_{\sigma}=C_1-C_2$


  

The local material birefringence magnitude is:



$B_{\mathrm{mat}}=|C_{\sigma}|(\sigma_1-\sigma_2)$


  

The result also includes a signed value and the local slow optical-axis direction. The frontend shows signed local birefringence, magnitude, and axis angle as separate fields. A cyclic colour scale shows the axis angle because minus 90 degrees and plus 90 degrees describe the same unoriented axis. A null value means that the stress splitting or the coefficient is zero. The code does not change this null value to zero degrees.

  

The results panel shows the core value, the material coefficient, the slow axis, and convergence. It also compares the normalized Figure 5.1 shape with the normalized FEM value of signed stress difference at core-element centres. This comparison reports RMSE, correlation, sign agreement, sample count, and fitted polarity. It is a qualitative shape comparison. It is not a quantitative stress error, Eshelby error, or birefringence error.

  

SOFTWARE STRUCTURE AND CHECKS

  

Python is the authoritative source for physics. Pydantic models define strict and fixed request and result contracts. FastAPI exposes the calculation endpoints. OpenAPI generates the shared TypeScript contract. React validates the response and draws the fields on a two-dimensional canvas.

  

The FEM code uses sparse matrices. The canvas groups many triangles into a small set of retained colour paths. This design avoids one visual element for every triangle. A live Standard solve used 6,192 elements and completed in about two seconds on the development system.

  

The project has tests for symmetry, rotation, masks, zero thermal mismatch, material conventions, load modes, force balance, convergence, API contracts, null axes, and frontend displays. Python checks use uv. Ruff, mypy, ESLint, Prettier, the production build, React Doctor, and live browser checks also verify the work.

  

CURRENT LIMITS

  

The Figure 5.1 field has no absolute stress scale. The FEM result depends on the supplied material data. The default PANDA data is for demonstration. Local material birefringence is not modal phase birefringence. The current module does not calculate modal group birefringence, beat length, or complete torsional polarization physics.

  

PLANNED WORK

  

Step 2.8 will add the remaining mechanical and optical connections in a controlled order. We must define the external pressure boundary. The model must state whether pressure acts on bare glass, a coating, or another support. The existing axial modes will remain separate from pressure.

  

The next optical part will connect the local photoelastic field to an optical mode method. This method can use a degenerate-mode perturbation matrix or a vector anisotropic mode solver. It will calculate modal phase birefringence from the two effective indices:

  

$B_p=n_{\mathrm{eff,slow}}-n_{\mathrm{eff,fast}}$

  

The application can calculate beat length only after it has a valid modal value:

  


$L_b=\frac{\lambda}{|B_p|}$


  

Spectral group birefringence will require stable results at more than one wavelength. A local value or a weighted estimate will keep an explicit estimate label. The application will not export such a value as validated modal birefringence.

  

Torsion will use a separate capability level. An ordinary in-plane FEM model cannot calculate complete fibre torsion. A first valid level can use Saint-Venant cross-sectional torsion and calculate the out-of-plane shear stresses \(\sigma_{xz}\) and \(\sigma_{yz}\). Claims about polarization coupling will require a vector approximation or a quasi-three-dimensional model.

  

Step 2.9 will complete concentrated validation. It will include analytical reference cases, invariance tests, mesh convergence, pressure tests, and modal checks. It will also include import and export checks, API contracts, build checks, and React Doctor. The project will retire the old active three-dimensional workflow only after both two-dimensional PANDA workspaces meet their acceptance criteria.

  

FINAL RESULT

  

Step 2 separates three result levels. Figure 5.1 gives a fast qualitative normalized kernel. Figure 9.1 gives a quantitative mechanical FEM result with explicit units and convergence. The future modal method will give quantitative optical propagation results. This separation keeps the simulation useful for research and education without making claims that the current equations and data cannot support.