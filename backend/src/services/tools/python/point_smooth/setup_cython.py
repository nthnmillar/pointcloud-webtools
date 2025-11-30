#!/usr/bin/env python3
"""
Setup script to compile Cython extension for point cloud smoothing.
"""

from setuptools import setup, Extension
from Cython.Build import cythonize

extensions = [
    Extension(
        "point_smooth_cython",
        ["point_smooth_cython.pyx"],
        extra_compile_args=['-O3', '-march=native', '-ffast-math'],
        extra_link_args=['-O3'],
        language="c"
    )
]

setup(
    name="point_smooth_cython",
    ext_modules=cythonize(
        extensions,
        compiler_directives={
            'language_level': "3",
            'boundscheck': False,
            'wraparound': False,
            'cdivision': True,
            'initializedcheck': False,
            'nonecheck': False,
        },
        annotate=False  # Set to True to generate HTML annotation
    ),
    zip_safe=False,
)

