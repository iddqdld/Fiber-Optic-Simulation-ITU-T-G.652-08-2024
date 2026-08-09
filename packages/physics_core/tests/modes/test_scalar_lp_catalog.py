import math

import pytest
from pydantic import ValidationError

from fibre_sim.modes import (
    ScalarLPModeCalculationError,
    ScalarLPModeCatalogRequest,
    ScalarLPModeFieldRequest,
    calculate_scalar_lp_mode_catalog,
)

BASE_PARAMETERS = {
    "wavelength_m": 1.55e-6,
    "n_core": 1.45,
    "n_cladding": 1.444,
}


def catalog_request_for_v(
    v_number: float,
    *,
    max_mode_families: int = 16,
) -> ScalarLPModeCatalogRequest:
    index_difference = math.sqrt(
        BASE_PARAMETERS["n_core"] ** 2 - BASE_PARAMETERS["n_cladding"] ** 2
    )
    core_radius_m = v_number * BASE_PARAMETERS["wavelength_m"] / (2.0 * math.pi * index_difference)
    return ScalarLPModeCatalogRequest(
        **BASE_PARAMETERS,
        core_radius_m=core_radius_m,
        max_mode_families=max_mode_families,
    )


def test_catalog_truncates_to_the_requested_number_of_mode_families() -> None:
    result = calculate_scalar_lp_mode_catalog(catalog_request_for_v(10.0, max_mode_families=4))

    assert result.catalog_truncated
    assert result.mode_regime == "multimode"
    assert [mode.label for mode in result.mode_families] == [
        "LP01",
        "LP11",
        "LP02",
        "LP21",
    ]
    assert len(result.mode_families) == 4
    assert all(
        mode.v_number_dimensionless > mode.cutoff_v_dimensionless for mode in result.mode_families
    )
    assert result.warnings == (
        "The supported-mode catalog is truncated to the first 4 mode families.",
    )


@pytest.mark.parametrize(
    "request_type,values",
    [
        (
            ScalarLPModeCatalogRequest,
            {
                "wavelength_m": 1.55e-6,
                "core_radius_m": 4.1e-6,
                "n_core": 1.444,
                "n_cladding": 1.45,
            },
        ),
        (
            ScalarLPModeCatalogRequest,
            {
                "wavelength_m": 0.0,
                "core_radius_m": 4.1e-6,
                "n_core": 1.45,
                "n_cladding": 1.444,
            },
        ),
        (
            ScalarLPModeCatalogRequest,
            {
                "wavelength_m": 1.55e-6,
                "core_radius_m": 4.1e-6,
                "n_core": 1.45,
                "n_cladding": 1.444,
                "max_mode_families": 17,
            },
        ),
        (
            ScalarLPModeFieldRequest,
            {
                "wavelength_m": 1.55e-6,
                "core_radius_m": 4.1e-6,
                "n_core": 1.45,
                "n_cladding": 1.444,
                "azimuthal_order": 0,
                "radial_order": 1,
                "grid_half_width_m": 8e-6,
                "grid_points": 64,
            },
        ),
    ],
)
def test_scalar_lp_requests_reject_invalid_values(
    request_type: type[ScalarLPModeCatalogRequest] | type[ScalarLPModeFieldRequest],
    values: dict[str, object],
) -> None:
    with pytest.raises(ValidationError):
        request_type.model_validate(values)


def test_field_request_rejects_invalid_index_order_and_mode_orders() -> None:
    common = {
        "wavelength_m": 1.55e-6,
        "core_radius_m": 4.1e-6,
        "n_core": 1.444,
        "n_cladding": 1.45,
        "grid_half_width_m": 8e-6,
        "grid_points": 9,
    }

    with pytest.raises(ValidationError):
        ScalarLPModeFieldRequest.model_validate(common | {"azimuthal_order": 0, "radial_order": 1})

    valid_indices = common | {"n_core": 1.45, "n_cladding": 1.444}
    with pytest.raises(ValidationError):
        ScalarLPModeFieldRequest.model_validate(
            valid_indices | {"azimuthal_order": -1, "radial_order": 1}
        )
    with pytest.raises(ValidationError):
        ScalarLPModeFieldRequest.model_validate(
            valid_indices | {"azimuthal_order": 0, "radial_order": 0}
        )


def test_catalog_request_forbids_extra_fields() -> None:
    values = {
        "wavelength_m": 1.55e-6,
        "core_radius_m": 4.1e-6,
        "n_core": 1.45,
        "n_cladding": 1.444,
        "unexpected": True,
    }

    with pytest.raises(ValidationError):
        ScalarLPModeCatalogRequest.model_validate(values)


def test_catalog_and_field_requests_are_frozen() -> None:
    catalog = catalog_request_for_v(2.0)
    field = ScalarLPModeFieldRequest(
        **BASE_PARAMETERS,
        core_radius_m=4.1e-6,
        azimuthal_order=0,
        radial_order=1,
        grid_half_width_m=8e-6,
        grid_points=9,
    )

    with pytest.raises(ValidationError):
        catalog.max_mode_families = 1
    with pytest.raises(ValidationError):
        field.grid_points = 7


def test_calculation_wraps_unsupported_field_modes() -> None:
    request = ScalarLPModeFieldRequest(
        **BASE_PARAMETERS,
        core_radius_m=4.1e-6,
        azimuthal_order=0,
        radial_order=2,
        grid_half_width_m=8e-6,
        grid_points=9,
    )

    with pytest.raises(ScalarLPModeCalculationError, match="not guided"):
        from fibre_sim.modes import calculate_scalar_lp_mode_field

        calculate_scalar_lp_mode_field(request)
