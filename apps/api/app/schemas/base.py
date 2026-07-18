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
    "_c",
    "_hz",
    "_mm",
    "_gpa",
    "_percent",
    "_m_per_s",
)

DIMENSIONLESS_NUMERIC_FIELDS: set[str] = {
    "random_seed",
    "max_iterations",
    "n_cladding",
    "n_core",
    "section_index",
    "grid_points",
    "macrobend_turns",
    "normalized_field",
    "normalized_intensity",
    "approximate_mode_count",
    "pmd_sample_cable_count",
}


class ContractModel(BaseModel):
    model_config = ConfigDict(extra="forbid")
