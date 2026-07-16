from importlib.metadata import version

import fibre_sim


def test_package_identity_and_distribution_version() -> None:
    assert fibre_sim.__name__ == "fibre_sim"
    assert version("fibre-sim") == "0.0.0"
