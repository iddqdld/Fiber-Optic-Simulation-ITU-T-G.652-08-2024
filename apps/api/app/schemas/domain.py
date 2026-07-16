from typing import Annotated, Literal

from pydantic import Field, model_validator

from .base import ContractModel
from .enums import (
    FibreStandard,
    IndexProfile,
    ModelProvenance,
    SimulationStatus,
    SourceType,
    StandardsCheckStatus,
    WarningSeverity,
)


class ModelReference(ContractModel):
    model_id: str
    model_version: str | None = None


class FibreDefinition(ContractModel):
    name: str
    standard_category: FibreStandard
    core_radius_um: float
    cladding_diameter_um: float
    n_core_model: ModelReference
    n_cladding_model: ModelReference
    index_profile: IndexProfile
    mode_field_diameter_model: ModelReference
    cutoff_wavelength_nm: float
    attenuation_model_id: str
    dispersion_model_id: str
    pmd_coefficient_ps_sqrt_km: float
    effective_area_um2: float | None = None
    metadata: dict[str, str] = Field(default_factory=dict)


class SourceDefinition(ContractModel):
    wavelength_nm: float
    input_power_dbm: float
    source_type: SourceType
    spectral_width_nm: float | None = None
    pulse_fwhm_ps: float | None = None
    beam_waist_um: float | None = None
    launch_offset_um: float | None = None
    launch_angle_deg: float | None = None
    polarization: str | None = None


class Bend(ContractModel):
    radius_um: float
    angle_deg: float


class CableSection(ContractModel):
    fibre_definition_id: str | None = None
    fibre_definition: FibreDefinition | None = None
    length_km: float
    temperature_c: float | None = None
    section_attenuation_override_db_km: float | None = None
    section_dispersion_override_ps_nm_km: float | None = None
    bends: list[Bend] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_fibre_selection(self) -> "CableSection":
        if (self.fibre_definition_id is None) == (self.fibre_definition is None):
            raise ValueError(
                "exactly one of fibre_definition_id or fibre_definition must be provided"
            )
        return self


class Splice(ContractModel):
    component_type: Literal["splice"] = "splice"
    location_km: float
    loss_db: float


class Connector(ContractModel):
    component_type: Literal["connector"] = "connector"
    location_km: float
    loss_db: float
    return_loss_db: float | None = None


type LinkComponent = Annotated[
    Splice | Connector,
    Field(discriminator="component_type"),
]


class SolverOptions(ContractModel):
    distance_step_km: float | None = None
    wavelength_step_nm: float | None = None
    time_step_ps: float | None = None
    max_iterations: int | None = None
    tolerance_dimensionless: float | None = None


class SimulationConfig(ContractModel):
    source: SourceDefinition
    sections: list[CableSection]
    components: list[LinkComponent] = Field(default_factory=list)
    solver_options: SolverOptions = Field(default_factory=SolverOptions)
    comparison_label: str | None = None
    random_seed: int | None = None


class DistanceSeries(ContractModel):
    distance_km: list[float] = Field(default_factory=list)
    power_dbm: list[float] = Field(default_factory=list)


class WavelengthSeries(ContractModel):
    wavelength_nm: list[float] = Field(default_factory=list)
    power_dbm: list[float] = Field(default_factory=list)


class PulseSeries(ContractModel):
    time_ps: list[float] = Field(default_factory=list)
    power_dbm: list[float] = Field(default_factory=list)


class FieldCrossSection(ContractModel):
    x_um: list[float] = Field(default_factory=list)
    y_um: list[float] = Field(default_factory=list)
    normalized_intensity: list[list[float]] = Field(default_factory=list)


class SectionResult(ContractModel):
    section_index: int
    length_km: float
    input_power_dbm: float | None = None
    output_power_dbm: float | None = None
    loss_db: float | None = None


class SimulationSummary(ContractModel):
    input_power_dbm: float | None = None
    output_power_dbm: float | None = None
    total_loss_db: float | None = None
    total_length_km: float | None = None
    peak_power_dbm: float | None = None


class ModelWarning(ContractModel):
    code: str
    message: str
    severity: WarningSeverity = WarningSeverity.WARNING
    field: str | None = None


class StandardsCheckItem(ContractModel):
    code: str
    name: str
    passed: bool
    message: str | None = None


class StandardsCheckMetadata(ContractModel):
    status: StandardsCheckStatus = StandardsCheckStatus.NOT_CHECKED
    standard_category: FibreStandard | None = None
    checks: list[StandardsCheckItem] = Field(default_factory=list)


class ValidInputRange(ContractModel):
    wavelength_min_nm: float | None = None
    wavelength_max_nm: float | None = None
    input_power_min_dbm: float | None = None
    input_power_max_dbm: float | None = None
    temperature_min_c: float | None = None
    temperature_max_c: float | None = None
    length_min_km: float | None = None
    length_max_km: float | None = None


class ModelManifest(ContractModel):
    model_name: str
    model_version: str
    assumptions: list[str] = Field(default_factory=list)
    valid_input_range: ValidInputRange | None = None
    warnings: list[ModelWarning] = Field(default_factory=list)
    units: dict[str, str] = Field(default_factory=dict)
    provenance: ModelProvenance
    schema_version: str | None = None


class SimulationResult(ContractModel):
    status: SimulationStatus = SimulationStatus.PENDING
    summary: SimulationSummary | None = None
    per_section_results: list[SectionResult] = Field(default_factory=list)
    distance_series: DistanceSeries | None = None
    wavelength_series: WavelengthSeries | None = None
    pulse_series: PulseSeries | None = None
    field_cross_section: FieldCrossSection | None = None
    warnings: list[ModelWarning] = Field(default_factory=list)
    standards_checks: list[StandardsCheckMetadata] = Field(default_factory=list)
    model_manifest: ModelManifest | None = None


class HealthResponse(ContractModel):
    status: Literal["ok"]
