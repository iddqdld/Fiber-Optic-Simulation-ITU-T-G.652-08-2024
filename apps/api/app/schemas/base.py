from pydantic import BaseModel, ConfigDict

PHYSICAL_UNIT_SUFFIXES: tuple[str, ...] = (
    "_nm",
    "_um",
    "_um2",
    "_km",
    "_db",
    "_dbm",
    "_db_km",
    "_ps",
    "_ps_nm_km",
    "_ps_sqrt_km",
    "_deg",
    "_rad",
    "_c",
    "_hz",
    "_mm",
    "_gpa",
    "_percent",
    "_m_per_s",
    "_m",
    "_n",
    "_pa",
    "_k",
)

DIMENSIONLESS_NUMERIC_FIELDS: set[str] = {
    "random_seed",
    "max_iterations",
    "n_cladding",
    "n_core",
    "section_index",
    "sample_count",
    "grid_points",
    "macrobend_turns",
    "normalized_field",
    "normalized_intensity",
    "approximate_mode_count",
    "pmd_sample_cable_count",
    "prescribed_strain",
    "valid_point_count",
    "normalized_deviatoric_difference_kernel",
    "sap_thermal_mismatch_strains",
    "kernel_scale",
    "poisson_ratio",
    "refractive_index",
    "p11",
    "p12",
}


class ContractModel(BaseModel):
    model_config = ConfigDict(extra="forbid")
