from enum import StrEnum


class PhotoelasticConvention(StrEnum):
    P11_P12_STRAIN = "p11_p12_strain"
    C1_C2_STRESS_OPTIC = "c1_c2_stress_optic"


__all__ = ["PhotoelasticConvention"]
