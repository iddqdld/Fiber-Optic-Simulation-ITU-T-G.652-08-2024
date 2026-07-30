import pytest
from pydantic import BaseModel, ValidationError

from fibre_sim.photoelastic import (
    DEFAULT_FIELD_MAP_GRID_POINTS,
    MAX_FIELD_MAP_GRID_POINTS,
    MIN_FIELD_MAP_GRID_POINTS,
    AxialCondition,
    AxialLoad,
    CircularSAP,
    FieldMapSamplingConfig,
    MaterialConfidence,
    MaterialSource,
    PandaFieldMapRequest,
    PandaGeometry,
    PandaMaterial,
    PandaMaterialSet,
    PhotoelasticConvention,
    ThermalState,
)


def source() -> MaterialSource:
    return MaterialSource(
        citation="M1 demonstration dataset",
        confidence=MaterialConfidence.DEMONSTRATION_ONLY,
    )


def material(
    *,
    convention: PhotoelasticConvention = PhotoelasticConvention.P11_P12_STRAIN,
    **overrides: object,
) -> PandaMaterial:
    values: dict[str, object] = {
        "name": "silica demonstration material",
        "composition": "silica",
        "young_modulus_pa": 72.0e9,
        "poisson_ratio": 0.17,
        "cte_per_k": 5.5e-7,
        "refractive_index": 1.444,
        "photoelastic_convention": convention,
        "p11": 0.12 if convention is PhotoelasticConvention.P11_P12_STRAIN else None,
        "p12": 0.27 if convention is PhotoelasticConvention.P11_P12_STRAIN else None,
        "c1_per_pa": 1.0e-12 if convention is PhotoelasticConvention.C1_C2_STRESS_OPTIC else None,
        "c2_per_pa": 2.0e-12 if convention is PhotoelasticConvention.C1_C2_STRESS_OPTIC else None,
        "source": source(),
    }
    values.update(overrides)
    return PandaMaterial.model_validate(values)


def sap(center_x_m: float, center_y_m: float, *, radius_m: float = 17.0e-6) -> CircularSAP:
    return CircularSAP(
        radius_m=radius_m,
        center_x_m=center_x_m,
        center_y_m=center_y_m,
    )


def geometry(
    *, sap_1: CircularSAP | None = None, sap_2: CircularSAP | None = None
) -> PandaGeometry:
    return PandaGeometry(
        core_radius_m=4.1e-6,
        cladding_radius_m=62.5e-6,
        core_center_x_m=0.0,
        core_center_y_m=0.0,
        sap_1=sap_1 or sap(-32.0e-6, 0.0),
        sap_2=sap_2 or sap(32.0e-6, 0.0),
    )


def test_public_contracts_are_frozen_and_forbid_extra_fields() -> None:
    models: tuple[type[BaseModel], ...] = (
        MaterialSource,
        PandaMaterial,
        PandaMaterialSet,
        CircularSAP,
        PandaGeometry,
        ThermalState,
        AxialLoad,
        FieldMapSamplingConfig,
        PandaFieldMapRequest,
    )

    for model in models:
        assert model.model_config["frozen"] is True
        assert model.model_config["extra"] == "forbid"

    with pytest.raises(ValidationError):
        MaterialSource.model_validate({**source().model_dump(), "unexpected": True})


def test_material_requires_one_complete_matching_photoelastic_convention() -> None:
    p11_material = material()
    stress_optic_material = material(
        convention=PhotoelasticConvention.C1_C2_STRESS_OPTIC,
    )

    assert p11_material.p11 == 0.12
    assert p11_material.c1_per_pa is None
    assert stress_optic_material.c1_per_pa == 1.0e-12
    assert stress_optic_material.p11 is None

    with pytest.raises(ValidationError, match="Both coefficients"):
        material(p12=None)
    with pytest.raises(ValidationError, match="Exactly one"):
        material(c1_per_pa=1.0e-12, c2_per_pa=2.0e-12)
    with pytest.raises(ValidationError, match="Exactly one"):
        material(convention=PhotoelasticConvention.C1_C2_STRESS_OPTIC, p11=0.12, p12=0.27)


@pytest.mark.parametrize(
    "field_name, value",
    [
        ("young_modulus_pa", 0.0),
        ("refractive_index", 0.0),
        ("poisson_ratio", -1.0),
        ("poisson_ratio", 0.5),
    ],
)
def test_material_rejects_invalid_physical_values(field_name: str, value: float) -> None:
    values = {
        "name": "silica demonstration material",
        "young_modulus_pa": 72.0e9,
        "poisson_ratio": 0.17,
        "cte_per_k": 5.5e-7,
        "refractive_index": 1.444,
        "photoelastic_convention": PhotoelasticConvention.P11_P12_STRAIN,
        "p11": 0.12,
        "p12": 0.27,
        "source": source(),
    }
    values[field_name] = value
    with pytest.raises(ValidationError):
        PandaMaterial.model_validate(values)


def test_material_fields_are_strict_and_sources_have_explicit_confidence() -> None:
    with pytest.raises(ValidationError):
        material(young_modulus_pa="72000000000")
    with pytest.raises(ValidationError):
        MaterialSource.model_validate({"citation": "source", "confidence": "unknown"})

    assert source().confidence is MaterialConfidence.DEMONSTRATION_ONLY


def test_cte_accepts_finite_signed_values() -> None:
    assert material(cte_per_k=-5.5e-7).cte_per_k == -5.5e-7


def test_geometry_accepts_two_independent_contained_non_overlapping_saps() -> None:
    model = geometry(
        sap_1=sap(-30.0e-6, 1.0e-6, radius_m=12.0e-6),
        sap_2=sap(29.0e-6, -2.0e-6, radius_m=13.0e-6),
    )

    assert model.sap_1.center_x_m != model.sap_2.center_x_m


def test_geometry_uses_the_configured_core_center_for_containment() -> None:
    model = PandaGeometry(
        core_radius_m=4.1e-6,
        cladding_radius_m=62.5e-6,
        core_center_x_m=10.0e-6,
        core_center_y_m=0.0,
        sap_1=sap(-30.0e-6, 10.0e-6, radius_m=10.0e-6),
        sap_2=sap(30.0e-6, -10.0e-6, radius_m=10.0e-6),
    )

    assert model.core_center_x_m == 10.0e-6

    with pytest.raises(ValidationError, match="overlap the core"):
        PandaGeometry(
            core_radius_m=4.1e-6,
            cladding_radius_m=62.5e-6,
            core_center_x_m=20.0e-6,
            core_center_y_m=0.0,
            sap_1=sap(32.0e-6, 0.0),
            sap_2=sap(-32.0e-6, 0.0),
        )


@pytest.mark.parametrize(
    "sap_1, sap_2, error_message",
    [
        (sap(50.0e-6, 0.0), sap(-32.0e-6, 0.0), "fully contained"),
        (sap(15.0e-6, 0.0), sap(32.0e-6, 0.0), "overlap the core"),
        (
            sap(14.1e-6, 0.0, radius_m=10.0e-6),
            sap(0.0, 14.1e-6, radius_m=10.0e-6),
            "must not overlap each other",
        ),
    ],
)
def test_geometry_rejects_invalid_circle_relationships(
    sap_1: CircularSAP, sap_2: CircularSAP, error_message: str
) -> None:
    with pytest.raises(ValidationError, match=error_message):
        geometry(sap_1=sap_1, sap_2=sap_2)


def test_geometry_rejects_core_larger_than_cladding() -> None:
    with pytest.raises(ValidationError, match="smaller than cladding"):
        PandaGeometry(
            core_radius_m=70.0e-6,
            cladding_radius_m=62.5e-6,
            core_center_x_m=0.0,
            core_center_y_m=0.0,
            sap_1=sap(-32.0e-6, 0.0),
            sap_2=sap(32.0e-6, 0.0),
        )


@pytest.mark.parametrize(
    ("condition", "prescribed_strain", "prescribed_force_n"),
    [
        (AxialCondition.FREE_RESULTANT, None, None),
        (AxialCondition.PRESCRIBED_FORCE, None, 1.0),
        (AxialCondition.PRESCRIBED_STRAIN, 250.0e-6, None),
    ],
)
def test_axial_load_accepts_only_matching_fields(
    condition: AxialCondition,
    prescribed_strain: float | None,
    prescribed_force_n: float | None,
) -> None:
    load = AxialLoad(
        condition=condition,
        prescribed_strain=prescribed_strain,
        prescribed_force_n=prescribed_force_n,
    )
    assert load.condition is condition


@pytest.mark.parametrize(
    ("condition", "prescribed_strain", "prescribed_force_n"),
    [
        (AxialCondition.FREE_RESULTANT, 1.0e-6, None),
        (AxialCondition.FREE_RESULTANT, None, 1.0),
        (AxialCondition.PRESCRIBED_FORCE, 1.0e-6, 1.0),
        (AxialCondition.PRESCRIBED_FORCE, None, None),
        (AxialCondition.PRESCRIBED_STRAIN, None, None),
        (AxialCondition.PRESCRIBED_STRAIN, 1.0e-6, 1.0),
    ],
)
def test_axial_load_rejects_inconsistent_fields(
    condition: AxialCondition,
    prescribed_strain: float | None,
    prescribed_force_n: float | None,
) -> None:
    with pytest.raises(ValidationError, match="match the selected axial condition"):
        AxialLoad(
            condition=condition,
            prescribed_strain=prescribed_strain,
            prescribed_force_n=prescribed_force_n,
        )


def test_sampling_requires_odd_bounded_strict_grid() -> None:
    sampling = FieldMapSamplingConfig(grid_half_width_m=100.0e-6, grid_points=401)
    assert sampling.grid_points == 401
    assert MIN_FIELD_MAP_GRID_POINTS == 401
    assert MAX_FIELD_MAP_GRID_POINTS == 601

    default_sampling = FieldMapSamplingConfig(grid_half_width_m=100.0e-6)
    assert default_sampling.grid_points == DEFAULT_FIELD_MAP_GRID_POINTS == 601

    for value in (3, 400, 402, 602):
        with pytest.raises(ValidationError):
            FieldMapSamplingConfig(grid_half_width_m=100.0e-6, grid_points=value)
    with pytest.raises(ValidationError):
        FieldMapSamplingConfig(grid_half_width_m=100.0e-6, grid_points=True)


def test_field_map_request_is_configuration_only_and_uses_si_wavelength() -> None:
    request = PandaFieldMapRequest(
        geometry=geometry(),
        materials=PandaMaterialSet(
            core=material(),
            cladding=material(),
            sap_1=material(),
            sap_2=material(),
        ),
        thermal=ThermalState(
            temperature_k=293.15,
            effective_fictive_temperature_k=1200.0,
        ),
        wavelength_m=1.55e-6,
        sampling=FieldMapSamplingConfig(grid_half_width_m=100.0e-6),
    )

    assert request.wavelength_m == 1.55e-6
    assert "axial" not in PandaFieldMapRequest.model_fields
    with pytest.raises(ValidationError):
        PandaFieldMapRequest.model_validate({**request.model_dump(), "result": {}})


def test_field_map_request_requires_sampling_to_cover_cladding() -> None:
    with pytest.raises(ValidationError, match="cover the cladding radius"):
        PandaFieldMapRequest(
            geometry=geometry(),
            materials=PandaMaterialSet(
                core=material(),
                cladding=material(),
                sap_1=material(),
                sap_2=material(),
            ),
            thermal=ThermalState(
                temperature_k=293.15,
                effective_fictive_temperature_k=1200.0,
            ),
            wavelength_m=1.55e-6,
            sampling=FieldMapSamplingConfig(grid_half_width_m=50.0e-6),
        )
