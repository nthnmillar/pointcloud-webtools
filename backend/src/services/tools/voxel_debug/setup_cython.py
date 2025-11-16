from setuptools import setup, Extension
from Cython.Build import cythonize
import os

# Get the directory where this script is located
script_dir = os.path.dirname(os.path.abspath(__file__))

extensions = [
    Extension(
        "voxel_debug_cython",
        [os.path.join(script_dir, "voxel_debug_cython.pyx")],
        extra_compile_args=['-O3', '-march=native', '-ffast-math'],
        extra_link_args=['-O3'],
        language="c"
    )
]

setup(
    name="voxel_debug_cython",
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
        annotate=False
    ),
    zip_safe=False,
)

