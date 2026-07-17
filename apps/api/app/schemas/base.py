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
)

DIMENSIONLESS_NUMERIC_FIELDS: set[str] = {
    "random_seed",
    "max_iterations",
    "n_cladding",
    "n_core",
    "section_index",
    "normalized_intensity",
    "approximate_mode_count",
}


class ContractModel(BaseModel):
    model_config = ConfigDict(extra="forbid")
