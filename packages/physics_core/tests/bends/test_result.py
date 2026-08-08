from fibre_sim.bends import MacrobendLossManifest


def test_manifest_exposes_the_approved_scientific_scope() -> None:
    manifest = MacrobendLossManifest()

    assert manifest.model_id == "marcuse_lp01_step_index_macrobend"
    assert manifest.scientific_label == ("Estimated LP01 macrobend radiation loss — Marcuse model")
    assert manifest.loss_source == "calculated"
    assert manifest.path_model == "piecewise_constant_curvature"
    assert any("not measured manufacturer" in item for item in manifest.limitations)
    assert any("not a G.652 compliance certificate" in item for item in manifest.limitations)
