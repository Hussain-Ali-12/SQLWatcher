from setuptools import setup

setup(
    name="sqlwatcher-shared",
    version="2.0.0",
    packages=["shared", "shared.detection", "shared.sql"],
    package_dir={
        "shared": ".",
        "shared.detection": "detection",
        "shared.sql": "sql",
    },
    install_requires=[
        "sqlglot==26.3.9",
    ],
)
