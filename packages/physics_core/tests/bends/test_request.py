import math
from typing import cast

import pytest
from pydantic import ValidationError

from fibre_sim.bends import (
    BendDirection,
    MacrobendInput,
    MacrobendLossRequest,
    MarcuseBendLossInput,
)


def base_request() -> dict[str, object]:
    return {
        "wavelength_m": 1.55e-6,
        "core_radius_m": 4.1e-6,
        "cladding_radius_m": 62.5e-6,
        "n_core": 1.4504,
        "n_cladding": 1.4447,
        "input_power_dbm": -3.0,
        "bends": (),
    }


def test_bend_input_contains_geometry_only() -> None:
    bend = MacrobendInput(
        position_fraction=0.5,
        radius_mm=30.0,
        angle_deg=90.0,
        direction=BendDirection.RIGHT,
    )

    assert set(bend.model_dump()) == {
        "position_fraction",
        "radius_mm",
        "angle_deg",
        "direction",
    }


@pytest.mark.parametrize("field", ["wavelength_m", "core_radius_m"])
def test_positive_optical_lengths_are_required(field: str) -> None:
    values = base_request()
    values[field] = 0.0

    with pytest.raises(ValidationError):
        MacrobendLossRequest.model_validate(values)


def test_non_finite_and_reversed_indices_are_rejected() -> None:
    for values in (
        {**base_request(), "n_core": math.nan},
        {**base_request(), "n_core": 1.44, "n_cladding": 1.45},
    ):
        with pytest.raises(ValidationError):
            MacrobendLossRequest.model_validate(values)


def test_core_radius_must_be_less_than_known_cladding_radius() -> None:
    with pytest.raises(ValidationError, match="Core radius must be less"):
        MacrobendLossRequest.model_validate({**base_request(), "core_radius_m": 70e-6})


def test_beta_must_stay_inside_guided_mode_bounds() -> None:
    values = base_request()
    k0 = 2.0 * math.pi / cast(float, values["wavelength_m"])
    values.pop("input_power_dbm")
    values.pop("bends")

    for beta in (1.4447 * k0, 1.4504 * k0):
        with pytest.raises(ValidationError, match="guided-mode bounds"):
            MarcuseBendLossInput.model_validate(
                {
                    **values,
                    "beta_per_m": beta,
                    "bend_radius_m": 0.03,
                }
            )


def test_bend_positions_must_be_strictly_increasing() -> None:
    repeated = MacrobendInput(position_fraction=0.5, radius_mm=30.0, angle_deg=90.0)

    with pytest.raises(ValidationError, match="strictly increasing"):
        MacrobendLossRequest.model_validate({**base_request(), "bends": (repeated, repeated)})
